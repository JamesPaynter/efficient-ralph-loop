import type { BootstrapCommandSummary } from "./attempt-summary.js";
import type { CodexRunnerLike } from "./codex.js";
import type { WorkerLogger } from "./logging.js";
import {
  buildImplementationPrompt,
  runImplementationAttempt,
  type LastFailure,
} from "./loop-implementation-helpers.js";
import type { TaskManifest } from "./loop.js";
import { WorkerStateStore } from "./state.js";

// =============================================================================
// IMPLEMENTATION LOOP
// =============================================================================

export async function runImplementationLoop(args: {
  attempt: number;
  lastAttemptSummary: string | null;
  loggedResumeEvent: boolean;
  pendingBootstrapResults?: BootstrapCommandSummary[];
  fastFailureOutput: string | null;
  hasRetryLimit: boolean;
  retryLimit: number;
  maxRetries: number;
  strictTddEnabled: boolean;
  spec: string;
  manifest: TaskManifest;
  manifestPath: string;
  taskBranch?: string;
  declaredWriteGlobs: string[];
  testPaths: string[];
  codex: CodexRunnerLike;
  workerState: WorkerStateStore;
  log: WorkerLogger;
  logCodexPrompts: boolean;
  workingDirectory: string;
  checkpointCommits: boolean;
  runLogsDir: string;
  commandEnv: NodeJS.ProcessEnv;
  lintCommand?: string;
  lintTimeoutSeconds?: number;
  doctorCmd: string;
  doctorTimeoutSeconds?: number;
  taskId: string;
}): Promise<void> {
  let isFirstImplementationAttempt = true;
  let stageBStarted = false;
  let attempt = args.attempt;
  let lastAttemptSummary = args.lastAttemptSummary;
  let loggedResumeEvent = args.loggedResumeEvent;
  let lastFailure: LastFailure | null = null;
  let pendingBootstrapResults = args.pendingBootstrapResults;

  const shouldRetryAttempt = (currentAttempt: number): boolean =>
    !args.hasRetryLimit || currentAttempt < args.retryLimit;
  const consumeBootstrapResults = (): BootstrapCommandSummary[] | undefined => {
    if (!pendingBootstrapResults || pendingBootstrapResults.length === 0) {
      return undefined;
    }
    const current = pendingBootstrapResults;
    pendingBootstrapResults = undefined;
    return current;
  };

  for (; !args.hasRetryLimit || attempt <= args.retryLimit; attempt += 1) {
    if (args.strictTddEnabled && !stageBStarted) {
      args.log.log({
        type: "tdd.stage.start",
        attempt,
        payload: { stage: "B", mode: "strict" },
      });
      stageBStarted = true;
    }

    const { prompt, promptKind } = buildImplementationPrompt({
      isFirstAttempt: isFirstImplementationAttempt,
      spec: args.spec,
      manifest: args.manifest,
      manifestPath: args.manifestPath,
      taskBranch: args.taskBranch,
      lastAttemptSummary,
      declaredWriteGlobs: args.declaredWriteGlobs,
      strictTddEnabled: args.strictTddEnabled,
      testPaths: args.testPaths,
      fastFailureOutput: args.fastFailureOutput,
      lastFailure,
      failedAttempt: attempt - 1,
    });

    const bootstrapForAttempt = consumeBootstrapResults();

    const attemptResult = await runImplementationAttempt({
      attempt,
      prompt,
      promptKind,
      log: args.log,
      codex: args.codex,
      workerState: args.workerState,
      loggedResumeEvent,
      logCodexPrompts: args.logCodexPrompts,
      runLogsDir: args.runLogsDir,
      workingDirectory: args.workingDirectory,
      declaredWriteGlobs: args.declaredWriteGlobs,
      bootstrapForAttempt,
      checkpointCommits: args.checkpointCommits,
      taskId: args.taskId,
      manifest: args.manifest,
      lintCommand: args.lintCommand,
      lintTimeoutSeconds: args.lintTimeoutSeconds,
      commandEnv: args.commandEnv,
      doctorCmd: args.doctorCmd,
      doctorTimeoutSeconds: args.doctorTimeoutSeconds,
      strictTddEnabled: args.strictTddEnabled,
    });

    loggedResumeEvent = attemptResult.loggedResumeEvent;
    isFirstImplementationAttempt = false;

    if (attemptResult.status === "complete") {
      return;
    }

    lastAttemptSummary = attemptResult.lastAttemptSummary;
    lastFailure = attemptResult.lastFailure;

    if (shouldRetryAttempt(attempt)) {
      args.log.log({ type: "task.retry", attempt: attempt + 1 });
    }
  }

  if (args.hasRetryLimit && args.strictTddEnabled) {
    args.log.log({ type: "tdd.stage.fail", payload: { stage: "B", reason: "max_retries" } });
  }
  if (args.hasRetryLimit) {
    args.log.log({ type: "task.failed", payload: { attempts: args.maxRetries } });
    throw new Error(`Max retries exceeded (${args.maxRetries})`);
  }
}
