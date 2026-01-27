import type { BootstrapCommandSummary, CommandSummary, PromptKind } from "./attempt-summary.js";
import type { CodexRunnerLike } from "./codex.js";
import type { WorkerLogger } from "./logging.js";
import { runCodexStep } from "./loop-codex.js";
import { maybeCheckpointCommit, maybeCommit } from "./loop-git.js";
import { buildInitialPrompt, buildRetryPrompt } from "./loop-prompts.js";
import { runDoctorStep, runLintStep } from "./loop-verification.js";
import type { TaskManifest } from "./loop.js";
import { WorkerStateStore } from "./state.js";

// =============================================================================
// IMPLEMENTATION HELPERS
// =============================================================================

export type LastFailure = { type: "lint" | "doctor" | "codex" | "command"; output: string };

export type ImplementationAttemptResult =
  | {
      status: "retry";
      loggedResumeEvent: boolean;
      lastAttemptSummary: string;
      lastFailure: LastFailure;
    }
  | {
      status: "complete";
      loggedResumeEvent: boolean;
      lastAttemptSummary: string;
    };

export function buildImplementationPrompt(args: {
  isFirstAttempt: boolean;
  spec: string;
  manifest: TaskManifest;
  manifestPath: string;
  taskBranch?: string;
  lastAttemptSummary: string | null;
  declaredWriteGlobs: string[];
  strictTddEnabled: boolean;
  testPaths: string[];
  fastFailureOutput: string | null;
  lastFailure: LastFailure | null;
  failedAttempt: number;
}): { prompt: string; promptKind: PromptKind } {
  if (args.isFirstAttempt) {
    return {
      prompt: buildInitialPrompt({
        spec: args.spec,
        manifest: args.manifest,
        manifestPath: args.manifestPath,
        taskBranch: args.taskBranch,
        lastAttemptSummary: args.lastAttemptSummary,
        declaredWriteGlobs: args.declaredWriteGlobs,
        strictTddContext: args.strictTddEnabled
          ? {
              stage: "implementation",
              testPaths: args.testPaths,
              fastFailureOutput: args.fastFailureOutput ?? undefined,
            }
          : undefined,
      }),
      promptKind: "initial",
    };
  }

  return {
    prompt: buildRetryPrompt({
      spec: args.spec,
      lastFailure: args.lastFailure ?? { type: "doctor", output: "" },
      failedAttempt: args.failedAttempt,
      lastAttemptSummary: args.lastAttemptSummary,
      declaredWriteGlobs: args.declaredWriteGlobs,
    }),
    promptKind: "retry",
  };
}

export async function runImplementationAttempt(args: {
  attempt: number;
  prompt: string;
  promptKind: PromptKind;
  log: WorkerLogger;
  codex: CodexRunnerLike;
  workerState: WorkerStateStore;
  loggedResumeEvent: boolean;
  logCodexPrompts: boolean;
  runLogsDir: string;
  workingDirectory: string;
  declaredWriteGlobs: string[];
  bootstrapForAttempt?: BootstrapCommandSummary[];
  checkpointCommits: boolean;
  taskId: string;
  manifest: TaskManifest;
  lintCommand?: string;
  lintTimeoutSeconds?: number;
  commandEnv: NodeJS.ProcessEnv;
  doctorCmd: string;
  doctorTimeoutSeconds?: number;
  strictTddEnabled: boolean;
}): Promise<ImplementationAttemptResult> {
  const codexResult = await runCodexStep({
    attempt: args.attempt,
    codex: args.codex,
    log: args.log,
    workerState: args.workerState,
    loggedResumeEvent: args.loggedResumeEvent,
    logCodexPrompts: args.logCodexPrompts,
    prompt: args.prompt,
    promptKind: args.promptKind,
    runLogsDir: args.runLogsDir,
    workingDirectory: args.workingDirectory,
    declaredWriteGlobs: args.declaredWriteGlobs,
    bootstrapResults: args.bootstrapForAttempt,
  });

  if (codexResult.status === "retry") {
    return {
      status: "retry",
      loggedResumeEvent: codexResult.loggedResumeEvent,
      lastAttemptSummary: codexResult.promptSummary,
      lastFailure: codexResult.lastFailure,
    };
  }

  if (args.checkpointCommits) {
    await maybeCheckpointCommit({
      cwd: args.workingDirectory,
      taskId: args.taskId,
      attempt: args.attempt,
      log: args.log,
      workerState: args.workerState,
    });
  } else {
    args.log.log({
      type: "git.checkpoint.skip",
      attempt: args.attempt,
      payload: { reason: "disabled" },
    });
  }

  let lintSummary: CommandSummary | undefined;
  const lintResult = await runLintStep({
    attempt: args.attempt,
    lintCommand: args.lintCommand,
    lintTimeoutSeconds: args.lintTimeoutSeconds,
    commandEnv: args.commandEnv,
    runLogsDir: args.runLogsDir,
    workingDirectory: args.workingDirectory,
    log: args.log,
    promptKind: args.promptKind,
    declaredWriteGlobs: args.declaredWriteGlobs,
    bootstrap: args.bootstrapForAttempt,
  });

  if (lintResult.status === "retry") {
    return {
      status: "retry",
      loggedResumeEvent: codexResult.loggedResumeEvent,
      lastAttemptSummary: lintResult.promptSummary,
      lastFailure: lintResult.lastFailure,
    };
  }

  if (lintResult.status === "pass") {
    lintSummary = lintResult.summary;
  }

  const doctorResult = await runDoctorStep({
    attempt: args.attempt,
    doctorCommand: args.doctorCmd,
    doctorTimeoutSeconds: args.doctorTimeoutSeconds,
    commandEnv: args.commandEnv,
    runLogsDir: args.runLogsDir,
    workingDirectory: args.workingDirectory,
    log: args.log,
    promptKind: args.promptKind,
    declaredWriteGlobs: args.declaredWriteGlobs,
    strictTddEnabled: args.strictTddEnabled,
    bootstrap: args.bootstrapForAttempt,
    lintSummary,
  });

  if (doctorResult.status === "retry") {
    return {
      status: "retry",
      loggedResumeEvent: codexResult.loggedResumeEvent,
      lastAttemptSummary: doctorResult.promptSummary,
      lastFailure: doctorResult.lastFailure,
    };
  }

  await maybeCommit({
    cwd: args.workingDirectory,
    manifest: args.manifest,
    taskId: args.taskId,
    attempt: args.attempt,
    log: args.log,
    workerState: args.checkpointCommits ? args.workerState : undefined,
  });
  args.log.log({ type: "task.complete", attempt: args.attempt });

  return {
    status: "complete",
    loggedResumeEvent: codexResult.loggedResumeEvent,
    lastAttemptSummary: doctorResult.promptSummary,
  };
}
