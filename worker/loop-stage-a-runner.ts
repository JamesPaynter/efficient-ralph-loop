import type { BootstrapCommandSummary, PromptKind } from "./attempt-summary.js";
import type { CodexRunnerLike } from "./codex.js";
import type { WorkerLogger } from "./logging.js";
import { runStrictTddStageA } from "./loop-tdd-stage-a.js";
import type { TaskManifest } from "./loop.js";
import { WorkerStateStore } from "./state.js";

// =============================================================================
// STRICT TDD LOOP
// =============================================================================

export type StageAState = {
  attempt: number;
  lastAttemptSummary: string | null;
  loggedResumeEvent: boolean;
  pendingBootstrapResults?: BootstrapCommandSummary[];
  fastFailureOutput: string | null;
};

export async function runStrictTddStageALoop(args: {
  strictTddEnabled: boolean;
  attempt: number;
  lastAttemptSummary: string | null;
  loggedResumeEvent: boolean;
  pendingBootstrapResults?: BootstrapCommandSummary[];
  fastFailureOutput: string | null;
  hasRetryLimit: boolean;
  retryLimit: number;
  maxRetries: number;
  taskId: string;
  manifest: TaskManifest;
  manifestPath: string;
  spec: string;
  taskBranch?: string;
  codex: CodexRunnerLike;
  workerState: WorkerStateStore;
  log: WorkerLogger;
  logCodexPrompts: boolean;
  workingDirectory: string;
  checkpointCommits: boolean;
  testPaths: string[];
  fastCommand?: string;
  doctorTimeoutSeconds?: number;
  runLogsDir: string;
  commandEnv: NodeJS.ProcessEnv;
  declaredWriteGlobs: string[];
}): Promise<StageAState> {
  if (!args.strictTddEnabled) {
    return {
      attempt: args.attempt,
      lastAttemptSummary: args.lastAttemptSummary,
      loggedResumeEvent: args.loggedResumeEvent,
      pendingBootstrapResults: args.pendingBootstrapResults,
      fastFailureOutput: args.fastFailureOutput,
    };
  }

  let stageAPromptKind: PromptKind = "initial";
  let stageAComplete = false;
  let attempt = args.attempt;
  let lastAttemptSummary = args.lastAttemptSummary;
  let loggedResumeEvent = args.loggedResumeEvent;
  let pendingBootstrapResults = args.pendingBootstrapResults;
  let fastFailureOutput = args.fastFailureOutput;

  while (!stageAComplete && (!args.hasRetryLimit || attempt <= args.retryLimit)) {
    const stageAResult = await runStrictTddStageA({
      attempt,
      promptKind: stageAPromptKind,
      lastAttemptSummary,
      taskId: args.taskId,
      manifest: args.manifest,
      manifestPath: args.manifestPath,
      spec: args.spec,
      taskBranch: args.taskBranch,
      codex: args.codex,
      workerState: args.workerState,
      log: args.log,
      loggedResumeEvent,
      logCodexPrompts: args.logCodexPrompts,
      workingDirectory: args.workingDirectory,
      checkpointCommits: args.checkpointCommits,
      testPaths: args.testPaths,
      fastCommand: args.fastCommand,
      doctorTimeoutSeconds: args.doctorTimeoutSeconds,
      runLogsDir: args.runLogsDir,
      commandEnv: args.commandEnv,
      declaredWriteGlobs: args.declaredWriteGlobs,
      bootstrapResults: pendingBootstrapResults,
    });

    if (stageAResult.status === "skipped") {
      stageAComplete = true;
      break;
    }

    lastAttemptSummary = stageAResult.promptSummary;
    loggedResumeEvent = stageAResult.loggedResumeEvent;
    if (stageAResult.bootstrapConsumed) {
      pendingBootstrapResults = undefined;
    }

    if (stageAResult.status === "retry") {
      if (!args.hasRetryLimit || stageAResult.nextAttempt <= args.retryLimit) {
        if (!args.hasRetryLimit || attempt < args.retryLimit) {
          args.log.log({ type: "task.retry", attempt: stageAResult.nextAttempt });
        }
        attempt = stageAResult.nextAttempt;
        stageAPromptKind = "retry";
        continue;
      }
      attempt = stageAResult.nextAttempt;
      break;
    }

    attempt = stageAResult.nextAttempt;
    fastFailureOutput = stageAResult.fastOutput;
    stageAComplete = true;
  }

  if (args.hasRetryLimit && attempt > args.retryLimit) {
    args.log.log({ type: "tdd.stage.fail", payload: { stage: "A", reason: "max_retries" } });
    args.log.log({ type: "task.failed", payload: { attempts: args.maxRetries } });
    throw new Error(`Max retries exceeded (${args.maxRetries})`);
  }

  return {
    attempt,
    lastAttemptSummary: lastAttemptSummary ?? null,
    loggedResumeEvent,
    pendingBootstrapResults,
    fastFailureOutput,
  };
}
