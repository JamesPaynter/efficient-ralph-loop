import {
  buildAttemptSummary,
  persistAttemptSummary,
  type AttemptPhase,
  type AttemptSummary,
  type BootstrapCommandSummary,
  type CommandSummary,
  type PromptKind,
  type RetryReason,
} from "./attempt-summary.js";
import type { WorkerLogger } from "./logging.js";
import { OUTPUT_PREVIEW_LIMIT } from "./loop-constants.js";
import { filterInternalChanges, listChangedPaths } from "./loop-io.js";

// =============================================================================
// REPORTING
// =============================================================================

export function buildCommandSummary(args: {
  command: string;
  exitCode: number;
  output: string;
  logPath: string;
}): CommandSummary {
  const summary: CommandSummary = {
    command: args.command,
    exit_code: args.exitCode,
    log_path: args.logPath,
  };

  if (args.output.trim().length > 0) {
    summary.output_preview = args.output.slice(0, OUTPUT_PREVIEW_LIMIT);
  }

  return summary;
}

export function buildCommandsSummary(args: {
  bootstrap?: BootstrapCommandSummary[];
  lint?: CommandSummary;
  doctor?: CommandSummary;
}): AttemptSummary["commands"] | undefined {
  const commands: AttemptSummary["commands"] = {};
  if (args.bootstrap && args.bootstrap.length > 0) {
    commands.bootstrap = args.bootstrap;
  }
  if (args.lint) {
    commands.lint = args.lint;
  }
  if (args.doctor) {
    commands.doctor = args.doctor;
  }
  return Object.keys(commands).length > 0 ? commands : undefined;
}

export async function recordAttemptSummary(args: {
  attempt: number;
  phase: AttemptPhase;
  promptKind: PromptKind;
  declaredWriteGlobs: string[];
  runLogsDir: string;
  workingDirectory: string;
  log: WorkerLogger;
  retry?: RetryReason;
  tdd?: AttemptSummary["tdd"];
  commands?: AttemptSummary["commands"];
}): Promise<{ summary: AttemptSummary; promptSummary: string }> {
  const changedFiles = await listFilteredChanges(args.workingDirectory, args.runLogsDir);
  const summary = buildAttemptSummary({
    attempt: args.attempt,
    phase: args.phase,
    prompt_kind: args.promptKind,
    changed_files: changedFiles,
    declared_write_globs: args.declaredWriteGlobs,
    tdd: args.tdd,
    commands: args.commands,
    retry: args.retry,
  });

  const persisted = await persistAttemptSummary(args.runLogsDir, summary);
  if (summary.scope_divergence?.out_of_scope_files?.length) {
    args.log.log({
      type: "scope.divergence",
      attempt: args.attempt,
      payload: {
        declared_write_globs: summary.scope_divergence.declared_write_globs,
        out_of_scope_files: summary.scope_divergence.out_of_scope_files,
      },
    });
  }

  return { summary, promptSummary: persisted.promptSummary };
}

async function listFilteredChanges(
  workingDirectory: string,
  runLogsDir: string,
): Promise<string[]> {
  const changes = await listChangedPaths(workingDirectory);
  return filterInternalChanges(changes, workingDirectory, runLogsDir);
}
