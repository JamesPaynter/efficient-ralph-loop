import type { PromptKind, RetryReason } from "./attempt-summary.js";
import { safeAttemptName, toErrorMessage, writeRunLog, type WorkerLogger } from "./logging.js";
import { OUTPUT_PREVIEW_LIMIT } from "./loop-constants.js";
import { cleanNonTestChanges, runVerificationCommand } from "./loop-io.js";
import { buildCommandsSummary, recordAttemptSummary } from "./loop-reporting.js";

// =============================================================================
// STRICT TDD STAGE A HELPERS
// =============================================================================

type RetryResult = {
  status: "retry";
  nextAttempt: number;
  loggedResumeEvent: boolean;
  promptSummary: string;
  bootstrapConsumed: boolean;
};

export type FastCommandResult = {
  output: string;
  exitCode: number;
  error: unknown | null;
  logFile: string;
};

export async function recordStageACodexFailure(args: {
  attempt: number;
  promptKind: PromptKind;
  declaredWriteGlobs: string[];
  runLogsDir: string;
  workingDirectory: string;
  log: WorkerLogger;
  error: unknown;
  commands: ReturnType<typeof buildCommandsSummary> | undefined;
}): Promise<{ promptSummary: string }> {
  const errorMessage = toErrorMessage(args.error);
  const errorLog = `codex-error-${safeAttemptName(args.attempt)}.log`;
  writeRunLog(args.runLogsDir, errorLog, `${errorMessage}\n`);

  const retryReason: RetryReason = {
    reason_code: "codex_error",
    human_readable_reason: "Codex turn failed. Retrying.",
    evidence_paths: [errorLog],
  };

  return recordAttemptSummary({
    attempt: args.attempt,
    phase: "tdd_stage_a",
    promptKind: args.promptKind,
    declaredWriteGlobs: args.declaredWriteGlobs,
    runLogsDir: args.runLogsDir,
    workingDirectory: args.workingDirectory,
    log: args.log,
    retry: retryReason,
    commands: args.commands,
  });
}

export async function handleStageANonTestChanges(args: {
  attempt: number;
  promptKind: PromptKind;
  declaredWriteGlobs: string[];
  runLogsDir: string;
  workingDirectory: string;
  log: WorkerLogger;
  files: string[];
  commands: ReturnType<typeof buildCommandsSummary> | undefined;
  loggedResumeEvent: boolean;
  bootstrapConsumed: boolean;
}): Promise<RetryResult> {
  args.log.log({
    type: "tdd.stage.fail",
    attempt: args.attempt,
    payload: { stage: "A", reason: "non_test_changes", files: args.files },
  });
  await cleanNonTestChanges({
    cwd: args.workingDirectory,
    files: args.files,
    log: args.log,
    attempt: args.attempt,
  });

  const retryReason: RetryReason = {
    reason_code: "non_test_changes",
    human_readable_reason: "Changes outside test_paths detected; reverted non-test changes.",
    evidence_paths: [],
  };
  const summaryResult = await recordAttemptSummary({
    attempt: args.attempt,
    phase: "tdd_stage_a",
    promptKind: args.promptKind,
    declaredWriteGlobs: args.declaredWriteGlobs,
    runLogsDir: args.runLogsDir,
    workingDirectory: args.workingDirectory,
    log: args.log,
    retry: retryReason,
    tdd: { non_test_changes_detected: args.files },
    commands: args.commands,
  });

  return {
    status: "retry",
    nextAttempt: args.attempt + 1,
    loggedResumeEvent: args.loggedResumeEvent,
    promptSummary: summaryResult.promptSummary,
    bootstrapConsumed: args.bootstrapConsumed,
  };
}

export async function runFastCommand(args: {
  attempt: number;
  command: string;
  cwd: string;
  timeoutSeconds?: number;
  env: NodeJS.ProcessEnv;
  runLogsDir: string;
}): Promise<FastCommandResult> {
  let fastOutput = "";
  let fastExitCode = -1;
  let fastError: unknown = null;
  try {
    const fast = await runVerificationCommand({
      command: args.command,
      cwd: args.cwd,
      timeoutSeconds: args.timeoutSeconds,
      env: args.env,
    });
    fastOutput = fast.output.trim();
    fastExitCode = fast.exitCode;
  } catch (err) {
    fastError = err;
    fastOutput = toErrorMessage(err);
  }

  const logFile = fastError
    ? `verify-fast-error-${safeAttemptName(args.attempt)}.log`
    : `verify-fast-${safeAttemptName(args.attempt)}.log`;
  writeRunLog(args.runLogsDir, logFile, fastOutput + "\n");

  return {
    output: fastOutput,
    exitCode: fastExitCode,
    error: fastError,
    logFile,
  };
}

export async function handleStageAFastResult(args: {
  attempt: number;
  promptKind: PromptKind;
  declaredWriteGlobs: string[];
  runLogsDir: string;
  workingDirectory: string;
  log: WorkerLogger;
  fast: FastCommandResult;
  commands: ReturnType<typeof buildCommandsSummary> | undefined;
  loggedResumeEvent: boolean;
  bootstrapConsumed: boolean;
}): Promise<RetryResult | null> {
  if (args.fast.error) {
    args.log.log({
      type: "tdd.stage.fail",
      attempt: args.attempt,
      payload: { stage: "A", reason: "fast_error" },
    });

    const retryReason: RetryReason = {
      reason_code: "fast_error",
      human_readable_reason: "verify.fast failed to run.",
      evidence_paths: [args.fast.logFile],
    };
    const summaryResult = await recordAttemptSummary({
      attempt: args.attempt,
      phase: "tdd_stage_a",
      promptKind: args.promptKind,
      declaredWriteGlobs: args.declaredWriteGlobs,
      runLogsDir: args.runLogsDir,
      workingDirectory: args.workingDirectory,
      log: args.log,
      retry: retryReason,
      tdd: {
        fast_exit_code: args.fast.exitCode,
        fast_output_preview: args.fast.output.slice(0, OUTPUT_PREVIEW_LIMIT),
      },
      commands: args.commands,
    });

    return {
      status: "retry",
      nextAttempt: args.attempt + 1,
      loggedResumeEvent: args.loggedResumeEvent,
      promptSummary: summaryResult.promptSummary,
      bootstrapConsumed: args.bootstrapConsumed,
    };
  }

  if (args.fast.exitCode === 0) {
    args.log.log({
      type: "tdd.stage.fail",
      attempt: args.attempt,
      payload: { stage: "A", reason: "fast_passed" },
    });

    const retryReason: RetryReason = {
      reason_code: "fast_passed",
      human_readable_reason: "verify.fast passed unexpectedly; tests must fail first.",
      evidence_paths: [args.fast.logFile],
    };
    const summaryResult = await recordAttemptSummary({
      attempt: args.attempt,
      phase: "tdd_stage_a",
      promptKind: args.promptKind,
      declaredWriteGlobs: args.declaredWriteGlobs,
      runLogsDir: args.runLogsDir,
      workingDirectory: args.workingDirectory,
      log: args.log,
      retry: retryReason,
      tdd: {
        fast_exit_code: args.fast.exitCode,
        fast_output_preview: args.fast.output.slice(0, OUTPUT_PREVIEW_LIMIT),
      },
      commands: args.commands,
    });

    return {
      status: "retry",
      nextAttempt: args.attempt + 1,
      loggedResumeEvent: args.loggedResumeEvent,
      promptSummary: summaryResult.promptSummary,
      bootstrapConsumed: args.bootstrapConsumed,
    };
  }

  return null;
}

export function getStageASkipReason(
  fastCommand: string | undefined,
  testPaths: string[],
): string | null {
  const trimmedFast = fastCommand?.trim() ?? "";
  if (trimmedFast.length === 0) {
    return "missing_fast_command";
  }
  if (testPaths.length === 0) {
    return "missing_test_paths";
  }
  return null;
}
