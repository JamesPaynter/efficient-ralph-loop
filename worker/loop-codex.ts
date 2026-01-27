import type { BootstrapCommandSummary, PromptKind, RetryReason } from "./attempt-summary.js";
import type { CodexRunnerLike } from "./codex.js";
import {
  safeAttemptName,
  toErrorMessage,
  writeRunLog,
  type JsonObject,
  type WorkerLogger,
} from "./logging.js";
import { DOCTOR_PROMPT_LIMIT, PROMPT_PREVIEW_LIMIT } from "./loop-constants.js";
import { truncateText } from "./loop-io.js";
import { buildCommandsSummary, recordAttemptSummary } from "./loop-reporting.js";
import { WorkerStateStore } from "./state.js";

// =============================================================================
// CODEX TURNS
// =============================================================================

type CodexStepResult =
  | { status: "ok"; loggedResumeEvent: boolean }
  | {
      status: "retry";
      loggedResumeEvent: boolean;
      promptSummary: string;
      lastFailure: { type: "codex"; output: string };
    };

export async function runCodexStep(args: {
  attempt: number;
  prompt: string;
  promptKind: PromptKind;
  codex: CodexRunnerLike;
  log: WorkerLogger;
  workerState: WorkerStateStore;
  loggedResumeEvent: boolean;
  logCodexPrompts: boolean;
  runLogsDir: string;
  workingDirectory: string;
  declaredWriteGlobs: string[];
  bootstrapResults?: BootstrapCommandSummary[];
}): Promise<CodexStepResult> {
  let loggedResumeEvent = args.loggedResumeEvent;
  let codexError: unknown = null;
  try {
    loggedResumeEvent = await runCodexTurn({
      attempt: args.attempt,
      codex: args.codex,
      log: args.log,
      workerState: args.workerState,
      loggedResumeEvent,
      logCodexPrompts: args.logCodexPrompts,
      prompt: args.prompt,
      runLogsDir: args.runLogsDir,
    });
  } catch (err) {
    codexError = err;
  }

  if (!codexError) {
    return { status: "ok", loggedResumeEvent };
  }

  const errorMessage = toErrorMessage(codexError);
  const errorLog = `codex-error-${safeAttemptName(args.attempt)}.log`;
  writeRunLog(args.runLogsDir, errorLog, `${errorMessage}\n`);

  const retryReason: RetryReason = {
    reason_code: "codex_error",
    human_readable_reason: "Codex turn failed. Retrying.",
    evidence_paths: [errorLog],
  };
  const commands = buildCommandsSummary({ bootstrap: args.bootstrapResults });
  const summaryResult = await recordAttemptSummary({
    attempt: args.attempt,
    phase: "implementation",
    promptKind: args.promptKind,
    declaredWriteGlobs: args.declaredWriteGlobs,
    runLogsDir: args.runLogsDir,
    workingDirectory: args.workingDirectory,
    log: args.log,
    retry: retryReason,
    commands,
  });

  return {
    status: "retry",
    loggedResumeEvent,
    promptSummary: summaryResult.promptSummary,
    lastFailure: { type: "codex", output: errorMessage.slice(0, DOCTOR_PROMPT_LIMIT) },
  };
}

export async function runCodexTurn(args: {
  attempt: number;
  prompt: string;
  codex: CodexRunnerLike;
  log: WorkerLogger;
  workerState: WorkerStateStore;
  loggedResumeEvent: boolean;
  logCodexPrompts: boolean;
  runLogsDir: string;
}): Promise<boolean> {
  await args.workerState.recordAttemptStart(args.attempt);
  args.log.log({ type: "turn.start", attempt: args.attempt });

  const promptPreview = truncateText(args.prompt, PROMPT_PREVIEW_LIMIT);
  const shouldPersistPrompt = args.logCodexPrompts;
  const promptLogFile = shouldPersistPrompt
    ? `codex-prompt-${safeAttemptName(args.attempt)}.txt`
    : undefined;
  if (promptLogFile) {
    writeRunLog(args.runLogsDir, promptLogFile, `${args.prompt}\n`);
  }

  const promptPayload: JsonObject = {
    preview: promptPreview.text,
    truncated: promptPreview.truncated,
    length: args.prompt.length,
  };
  if (promptLogFile) {
    promptPayload.run_logs_file = promptLogFile;
  }
  args.log.log({
    type: "codex.prompt",
    attempt: args.attempt,
    payload: promptPayload,
  });

  let hasLoggedResume = args.loggedResumeEvent;
  await args.codex.streamPrompt(args.prompt, {
    onThreadResumed: (threadId: string) => {
      if (!hasLoggedResume) {
        args.log.log({
          type: "codex.thread.resumed",
          attempt: args.attempt,
          payload: { thread_id: threadId },
        });
        hasLoggedResume = true;
      }
    },
    onThreadStarted: async (threadId: string) => {
      await args.workerState.recordThreadId(threadId);
      args.log.log({
        type: "codex.thread.started",
        attempt: args.attempt,
        payload: { thread_id: threadId },
      });
    },
    onEvent: (event: unknown) =>
      args.log.log({
        type: "codex.event",
        attempt: args.attempt,
        payload: { event } as JsonObject,
      }),
  });

  args.log.log({ type: "turn.complete", attempt: args.attempt });
  return hasLoggedResume;
}
