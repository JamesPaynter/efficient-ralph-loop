/*
 * UI CLI helpers for starting the visualizer server and opening the browser.
 * Assumptions: localhost-only server; query params identify the project/run.
 * Common usage: `mycelium ui`, plus run/resume hooks for auto-launch.
 */

import { execa } from "execa";

import type { AppContext } from "../app/context.js";
import { createAppPathsContext } from "../app/paths.js";
import type { ProjectConfig, UiConfig } from "../core/config.js";
import { UserFacingError, USER_FACING_ERROR_CODES } from "../core/errors.js";
import { loadRunStateForProject } from "../core/state-store.js";
import { startUiServer, type UiServerHandle } from "../ui/server.js";

import { createRunStopSignalHandler } from "./signal-handlers.js";

// =============================================================================
// TYPES
// =============================================================================

export type UiOverrides = {
  enabled?: boolean;
  port?: number;
  openBrowser?: boolean;
};

export type UiRuntimeConfig = {
  enabled: boolean;
  port: number;
  openBrowser: boolean;
};

export type UiStartResult = {
  handle: UiServerHandle;
  url: string;
};

export type UiCommandOptions = {
  runId?: string;
  port?: number;
  openBrowser?: boolean;
};

// =============================================================================
// UI COMMAND
// =============================================================================

export async function uiCommand(
  projectName: string,
  config: ProjectConfig,
  opts: UiCommandOptions,
  appContext?: AppContext,
): Promise<void> {
  const paths = appContext?.paths ?? createAppPathsContext({ repoPath: config.repo_path });
  const resolved = await loadRunStateForProject(projectName, opts.runId, paths);
  if (!resolved) {
    printRunNotFound(projectName, opts.runId);
    return;
  }

  const runtime = resolveUiRuntimeConfig(config.ui, {
    enabled: true,
    port: opts.port,
    openBrowser: opts.openBrowser,
  });

  const uiStart = await launchUiServer({
    projectName,
    runId: resolved.runId,
    runtime,
    onError: "throw",
    appContext,
  });
  if (!uiStart) {
    console.error("UI server did not start.");
    process.exitCode = 1;
    return;
  }

  console.log(`UI server running at ${uiStart.url}`);
  await maybeOpenUiBrowser(uiStart.url, runtime.openBrowser);

  const stopHandler = createRunStopSignalHandler({
    onSignal: (signal) => {
      console.log(`Received ${signal}. Shutting down UI server.`);
    },
  });

  try {
    await waitForAbort(stopHandler.signal);
  } finally {
    stopHandler.cleanup();
    await closeUiServer(uiStart.handle);
  }
}

// =============================================================================
// UI RUNTIME
// =============================================================================

export function resolveUiRuntimeConfig(
  uiConfig: UiConfig,
  overrides: UiOverrides = {},
): UiRuntimeConfig {
  return {
    enabled: overrides.enabled ?? uiConfig.enabled,
    port: overrides.port ?? uiConfig.port,
    openBrowser: overrides.openBrowser ?? uiConfig.open_browser,
  };
}

export async function launchUiServer(args: {
  projectName: string;
  runId: string;
  runtime: UiRuntimeConfig;
  onError: "warn" | "throw";
  appContext?: AppContext;
}): Promise<UiStartResult | null> {
  if (!args.runtime.enabled) {
    return null;
  }

  try {
    const appContext = args.appContext;
    if (!appContext) {
      throw createUiStartConfigError(
        "App context is required to start the UI server. Create one via createAppContext() or loadAppContext().",
      );
    }

    const handle = await startUiServer({
      project: args.projectName,
      runId: args.runId,
      port: args.runtime.port,
      appContext,
    });

    return {
      handle,
      url: buildUiUrl(handle.url, args.projectName, args.runId),
    };
  } catch (err) {
    const hintContext =
      args.onError === "warn" ? UI_START_HINT_CONTEXT_OPTIONAL : UI_START_HINT_CONTEXT_COMMAND;
    const normalized = normalizeUiStartFailure(err, args.runtime.port, hintContext);
    if (args.onError === "warn") {
      console.warn(formatUiStartWarning(normalized));
      return null;
    }
    throw normalized;
  }
}

// =============================================================================
// UI BROWSER OPEN
// =============================================================================

export async function maybeOpenUiBrowser(url: string, openBrowser: boolean): Promise<void> {
  if (!shouldOpenBrowser(openBrowser)) {
    return;
  }

  try {
    await openBrowserUrl(url);
  } catch {
    // Best-effort: the URL is already printed for manual open.
  }
}

// =============================================================================
// UI SHUTDOWN
// =============================================================================

export async function closeUiServer(handle: UiServerHandle | null): Promise<void> {
  if (!handle) return;

  try {
    await handle.close();
  } catch (err) {
    const detail = describeUiServerError(err);
    const suffix = detail ? ` ${detail}` : "";
    console.warn(`Warning: failed to close UI server.${suffix}`);
  }
}

// =============================================================================
// INTERNALS
// =============================================================================

// =============================================================================
// UI START ERROR NORMALIZATION
// =============================================================================

type UiStartHintContext = {
  portFlag: string;
  allowDisable: boolean;
};

const UI_START_TITLE = "UI server failed to start.";
const UI_START_HINT_CONTEXT_OPTIONAL: UiStartHintContext = {
  portFlag: "--ui-port",
  allowDisable: true,
};
const UI_START_HINT_CONTEXT_COMMAND: UiStartHintContext = {
  portFlag: "--port",
  allowDisable: false,
};

function createUiStartConfigError(message: string): UserFacingError {
  return new UserFacingError({
    code: USER_FACING_ERROR_CODES.config,
    title: UI_START_TITLE,
    message,
  });
}

function normalizeUiStartFailure(
  error: unknown,
  port: number,
  hintContext: UiStartHintContext,
): UserFacingError {
  const normalized =
    error instanceof UserFacingError
      ? error
      : new UserFacingError({
          code: USER_FACING_ERROR_CODES.unknown,
          title: UI_START_TITLE,
          message: buildUiStartMessage(port),
          cause: error,
        });

  if (normalized.hint) {
    return normalized;
  }

  const hint = buildUiStartHint(normalized, hintContext);
  if (!hint) {
    return normalized;
  }

  return new UserFacingError({
    code: normalized.code,
    title: normalized.title,
    message: normalized.message,
    hint,
    next: normalized.next,
    cause: normalized.cause,
  });
}

function buildUiStartMessage(port: number): string {
  if (!Number.isFinite(port) || port === 0) {
    return "Unable to start the UI server.";
  }

  return `Unable to start the UI server on port ${port}.`;
}

function buildUiStartHint(error: UserFacingError, hintContext: UiStartHintContext): string | null {
  const code = resolveUiStartErrorCode(error);
  if (code === "EADDRINUSE") {
    return buildPortConflictHint(hintContext);
  }
  if (code === "EACCES") {
    return buildPortPermissionHint(hintContext);
  }

  if (hintContext.allowDisable) {
    return "Disable the UI with --no-ui to continue without it.";
  }

  return null;
}

function buildPortConflictHint(hintContext: UiStartHintContext): string {
  const suffix = hintContext.allowDisable ? " or disable the UI with --no-ui." : ".";
  return `Port is already in use. Choose another with ${hintContext.portFlag}${suffix}`;
}

function buildPortPermissionHint(hintContext: UiStartHintContext): string {
  const suffix = hintContext.allowDisable ? " or disable the UI with --no-ui." : ".";
  return `Permission denied binding the port. Choose another with ${hintContext.portFlag}${suffix}`;
}

function resolveUiStartErrorCode(error: UserFacingError): string | null {
  return resolveErrorCode(error.cause ?? error);
}

function resolveErrorCode(error: unknown): string | null {
  if (error && typeof error === "object") {
    const code = (error as { code?: string }).code;
    if (typeof code === "string") {
      return code;
    }
  }

  return null;
}

function buildUiUrl(baseUrl: string, projectName: string, runId: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("project", projectName);
  url.searchParams.set("runId", runId);
  return url.toString();
}

function shouldOpenBrowser(openBrowser: boolean): boolean {
  if (!openBrowser) return false;
  if (!process.stdout.isTTY) return false;
  if (process.env.CI) return false;
  return true;
}

async function openBrowserUrl(url: string): Promise<void> {
  if (process.platform === "darwin") {
    await execa("open", [url], { stdio: "ignore" });
    return;
  }

  if (process.platform === "win32") {
    await execa("cmd", ["/c", "start", "", url], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  await execa("xdg-open", [url], { stdio: "ignore" });
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

function formatUiStartWarning(error: UserFacingError): string {
  const hint = error.hint ? ` Hint: ${error.hint}` : "";
  return `Warning: ${error.message}${hint} Continuing without UI.`;
}

function describeUiServerError(err: unknown): string | null {
  if (err && typeof err === "object") {
    const code = (err as { code?: string }).code;
    if (code === "EADDRINUSE") {
      return "Port is already in use.";
    }
    if (code === "EACCES") {
      return "Permission denied binding the port.";
    }
    if (typeof code === "string") {
      return `Error code ${code}.`;
    }
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  return err ? String(err) : null;
}

function printRunNotFound(projectName: string, requestedRunId?: string): void {
  const notFound = requestedRunId
    ? `Run ${requestedRunId} not found for project ${projectName}.`
    : `No runs found for project ${projectName}.`;

  console.log(notFound);
  console.log(`Start a run with: mycelium run --project ${projectName}`);
  process.exitCode = 1;
}
