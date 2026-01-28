import fs from "node:fs/promises";
import path from "node:path";

import { TaskError, UserFacingError, USER_FACING_ERROR_CODES } from "../src/core/errors.js";
import { resolveTestPaths } from "../src/core/test-paths.js";

import { createCodexRunner } from "./codex.js";
import { createStdoutLogger, type JsonObject, type WorkerLogger } from "./logging.js";
import { runImplementationLoop } from "./loop-implementation-runner.js";
import { ensureGitIdentity, maybeFailWorkerOnce, runBootstrap } from "./loop-io.js";
import { loadTaskInputs, normalizeWriteGlobs, resolveLintCommand } from "./loop-parsing.js";
import { runStrictTddStageALoop } from "./loop-stage-a-runner.js";
import { WorkerStateStore } from "./state.js";

// =============================================================================
// TYPES & CONSTANTS
// =============================================================================

export type TaskManifest = {
  id: string;
  name: string;
  files?: { writes?: string[] };
  verify?: { doctor?: string; fast?: string; lint?: string };
  tdd_mode?: "off" | "strict";
  test_paths?: string[];
  affected_tests?: string[];
  [key: string]: unknown;
};

export type WorkerConfig = {
  taskId: string;
  taskSlug?: string;
  taskBranch?: string;
  specPath: string;
  manifestPath: string;
  lintCmd?: string;
  lintTimeoutSeconds?: number;
  doctorCmd: string;
  doctorTimeoutSeconds?: number;
  maxRetries: number;
  bootstrapCmds: string[];
  runLogsDir: string;
  codexHome: string;
  codexModel?: string;
  workingDirectory: string;
  checkpointCommits: boolean;
  defaultTestPaths?: string[];
  logCodexPrompts?: boolean;
};

// =============================================================================
// PUBLIC API
// =============================================================================

export async function runWorker(config: WorkerConfig, logger?: WorkerLogger): Promise<void> {
  const log = logger ?? createStdoutLogger({ taskId: config.taskId, taskSlug: config.taskSlug });
  const logCodexPrompts = config.logCodexPrompts === true;

  if (config.maxRetries < 0) {
    throw new Error(`maxRetries must be non-negative (received ${config.maxRetries})`);
  }

  await maybeFailWorkerOnce({ workingDirectory: config.workingDirectory, log });

  const { spec, manifest } = await loadTaskInputs(config.specPath, config.manifestPath);
  const workerFailOnceFile = path.join(config.codexHome, ".fail-once");
  const commandEnv: NodeJS.ProcessEnv = {
    ...process.env,
    TASK_ID: config.taskId,
    TASK_SLUG: config.taskSlug,
    TASK_BRANCH: config.taskBranch,
    CODEX_HOME: config.codexHome,
    RUN_LOGS_DIR: config.runLogsDir,
    WORKER_FAIL_ONCE_FILE: workerFailOnceFile,
    LOG_CODEX_PROMPTS: logCodexPrompts ? "1" : "0",
  };
  if (config.codexModel) {
    commandEnv.CODEX_MODEL = config.codexModel;
  }
  const workerPayload: JsonObject = {
    manifest_path: config.manifestPath,
    spec_path: config.specPath,
    bootstrap_cmds: config.bootstrapCmds.length,
    max_retries: config.maxRetries,
  };
  if (config.taskBranch) {
    workerPayload.branch = config.taskBranch;
  }
  log.log({ type: "worker.start", payload: workerPayload });

  await ensureGitIdentity(config.workingDirectory, log);

  let bootstrapResults: Awaited<ReturnType<typeof runBootstrap>> = [];
  if (config.bootstrapCmds.length > 0) {
    try {
      bootstrapResults = await runBootstrap({
        commands: config.bootstrapCmds,
        cwd: config.workingDirectory,
        log,
        runLogsDir: config.runLogsDir,
        env: commandEnv,
      });
    } catch (err) {
      throw createBootstrapFailureError(err);
    }
  }

  await fs.mkdir(config.codexHome, { recursive: true });

  const workerState = new WorkerStateStore(config.workingDirectory);
  await workerState.load();

  const retryLimit = config.maxRetries === 0 ? Number.POSITIVE_INFINITY : config.maxRetries;
  const hasRetryLimit = Number.isFinite(retryLimit);

  let attempt = workerState.nextAttempt;
  if (hasRetryLimit && attempt > retryLimit) {
    throw new Error(
      `No attempts remaining: next attempt ${attempt} exceeds max retries ${config.maxRetries}`,
    );
  }

  const codex = createCodexRunner({
    codexHome: config.codexHome,
    model: config.codexModel,
    workingDirectory: config.workingDirectory,
    threadId: workerState.threadId,
    taskId: config.taskId,
    manifestPath: config.manifestPath,
    specPath: config.specPath,
  });

  const strictTddEnabled = manifest.tdd_mode === "strict";
  const testPaths = resolveTestPaths(manifest.test_paths, config.defaultTestPaths);
  const lintCommand = resolveLintCommand(manifest, config.lintCmd);
  const declaredWriteGlobs = normalizeWriteGlobs(manifest.files?.writes);

  let pendingBootstrapResults = bootstrapResults.length > 0 ? bootstrapResults : undefined;
  let fastFailureOutput: string | null = null;
  let lastAttemptSummary: string | null = null;
  let loggedResumeEvent = false;
  const stageAState = await runStrictTddStageALoop({
    strictTddEnabled,
    attempt,
    lastAttemptSummary,
    loggedResumeEvent,
    pendingBootstrapResults,
    fastFailureOutput,
    hasRetryLimit,
    retryLimit,
    maxRetries: config.maxRetries,
    taskId: config.taskId,
    manifest,
    manifestPath: config.manifestPath,
    spec,
    taskBranch: config.taskBranch,
    codex,
    workerState,
    log,
    logCodexPrompts,
    workingDirectory: config.workingDirectory,
    checkpointCommits: config.checkpointCommits,
    testPaths,
    fastCommand: manifest.verify?.fast,
    doctorTimeoutSeconds: config.doctorTimeoutSeconds,
    runLogsDir: config.runLogsDir,
    commandEnv,
    declaredWriteGlobs,
  });

  attempt = stageAState.attempt;
  lastAttemptSummary = stageAState.lastAttemptSummary;
  loggedResumeEvent = stageAState.loggedResumeEvent;
  pendingBootstrapResults = stageAState.pendingBootstrapResults;
  fastFailureOutput = stageAState.fastFailureOutput;

  await runImplementationLoop({
    attempt,
    lastAttemptSummary,
    loggedResumeEvent,
    pendingBootstrapResults,
    fastFailureOutput,
    hasRetryLimit,
    retryLimit,
    maxRetries: config.maxRetries,
    strictTddEnabled,
    spec,
    manifest,
    manifestPath: config.manifestPath,
    taskBranch: config.taskBranch,
    declaredWriteGlobs,
    testPaths,
    codex,
    workerState,
    log,
    logCodexPrompts,
    workingDirectory: config.workingDirectory,
    checkpointCommits: config.checkpointCommits,
    runLogsDir: config.runLogsDir,
    commandEnv,
    lintCommand,
    lintTimeoutSeconds: config.lintTimeoutSeconds,
    doctorCmd: config.doctorCmd,
    doctorTimeoutSeconds: config.doctorTimeoutSeconds,
    taskId: config.taskId,
  });
}

// =============================================================================
// HELPERS
// =============================================================================

const BOOTSTRAP_FAILURE_TITLE = "Bootstrap failed.";
const BOOTSTRAP_FAILURE_MESSAGE = "Bootstrap command failed.";

function createBootstrapFailureError(error: unknown): UserFacingError {
  if (error instanceof UserFacingError) {
    return error;
  }

  const cause = createBootstrapFailureCause(error);
  return new UserFacingError({
    code: USER_FACING_ERROR_CODES.task,
    title: BOOTSTRAP_FAILURE_TITLE,
    message: BOOTSTRAP_FAILURE_MESSAGE,
    cause,
  });
}

function createBootstrapFailureCause(error: unknown): Error | undefined {
  const parsed = parseBootstrapExitFailure(error);
  if (parsed) {
    return new TaskError(
      `Bootstrap command failed: "${parsed.command}" exited with ${parsed.exitCode}.`,
    );
  }

  if (error instanceof Error) {
    return error;
  }

  if (error !== undefined && error !== null) {
    return new TaskError(String(error));
  }

  return undefined;
}

function parseBootstrapExitFailure(error: unknown): { command: string; exitCode: number } | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = /^Bootstrap command failed: "(.+)" exited with (-?\d+)\.?$/.exec(message);
  if (!match) {
    return null;
  }

  return { command: match[1], exitCode: Number(match[2]) };
}
