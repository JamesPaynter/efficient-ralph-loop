import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AppContext } from "../app/context.js";
import { UserFacingError, USER_FACING_ERROR_CODES } from "../core/errors.js";

import { createUiRouter } from "./router.js";

// =============================================================================
// TYPES
// =============================================================================

export type StartUiServerOptions = {
  project: string;
  runId: string;
  port?: number;
  appContext: AppContext;
};

export type UiServerHandle = {
  url: string;
  close: () => Promise<void>;
};

// =============================================================================
// PUBLIC API
// =============================================================================

export async function startUiServer(options: StartUiServerOptions): Promise<UiServerHandle> {
  const port = options.port ?? 0;
  try {
    if (!options.project) {
      throw createUiServerInputError("Project name is required to start the UI server.");
    }
    if (!options.runId) {
      throw createUiServerInputError("Run id is required to start the UI server.");
    }

    if (!Number.isInteger(port) || port < 0) {
      throw createUiServerInputError("Port must be a non-negative integer.");
    }

    const appContext = options.appContext;
    if (!appContext) {
      throw createUiServerInputError(
        "App context is required to start the UI server. Create one via createAppContext() or loadAppContext().",
      );
    }

    const staticRoot = resolveUiStaticRoot();
    const router = createUiRouter({
      projectName: options.project,
      runId: options.runId,
      staticRoot,
      paths: appContext.paths,
    });

    const server = http.createServer((req, res) => router(req, res));
    await listenOnLocalhost(server, port);

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine UI server address.");
    }

    const url = `http://127.0.0.1:${address.port}`;
    return {
      url,
      close: () => closeServer(server),
    };
  } catch (error) {
    throw createUiServerStartError(error, port);
  }
}

// =============================================================================
// INTERNALS
// =============================================================================

// =============================================================================
// UI START ERRORS
// =============================================================================

const UI_SERVER_START_TITLE = "UI server failed to start.";

function createUiServerInputError(message: string): UserFacingError {
  return new UserFacingError({
    code: USER_FACING_ERROR_CODES.config,
    title: UI_SERVER_START_TITLE,
    message,
  });
}

function createUiServerStartError(error: unknown, port: number): UserFacingError {
  if (error instanceof UserFacingError) {
    return error;
  }

  return new UserFacingError({
    code: USER_FACING_ERROR_CODES.unknown,
    title: UI_SERVER_START_TITLE,
    message: resolveUiStartMessage(port),
    cause: error,
  });
}

function resolveUiStartMessage(port: number): string {
  if (!Number.isFinite(port) || port === 0) {
    return "Unable to start the UI server.";
  }

  return `Unable to start the UI server on port ${port}.`;
}

function resolveUiStaticRoot(): string {
  const packageRoot = findPackageRoot(fileURLToPath(new URL(".", import.meta.url)));
  return path.join(packageRoot, "dist", "ui");
}

function findPackageRoot(startDir: string): string {
  let current = startDir;

  while (true) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) return current;

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error("package.json not found while resolving UI static root");
}

function listenOnLocalhost(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.off("error", onError);
      reject(err);
    };

    server.once("error", onError);
    server.listen({ host: "127.0.0.1", port }, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
