import fs from "node:fs";
import path from "node:path";

import { Command } from "commander";

import { loadProjectConfig } from "../core/config-loader.js";
import type { ProjectConfig } from "../core/config.js";
import { LogIndex, logIndexPath, type LogIndexQuery } from "../core/log-index.js";
import { loadRunStateForProject } from "../core/state-store.js";
import {
  followJsonlFile,
  readJsonlFile,
  searchLogs,
  taskEventsLogPathForId,
  findTaskLogDir,
  type JsonlFilter,
  type LogSearchResult,
} from "../core/log-query.js";
import { projectConfigPath, resolveRunLogsDir } from "../core/paths.js";
import type { DoctorValidationReport } from "../validators/doctor-validator.js";
import type { TestValidationReport } from "../validators/test-validator.js";

type ValidatorSummaryRow = {
  validator: string;
  status: string;
  summary: string | null;
  reportPath: string | null;
};

export function registerLogsCommand(program: Command): void {
  const logs = program
    .command("logs")
    .description("Inspect orchestrator and task logs")
    .requiredOption("--project <name>", "Project name")
    .option("--run-id <id>", "Run ID (default: latest)")
    .option("--use-index", "Query logs via SQLite index (builds if missing)", false)
    .option("--follow", "Follow orchestrator logs", false);

  logs
    .command("query")
    .description("Print JSONL events for orchestrator or a task")
    .option("--task <id>", "Task ID to filter")
    .option("--type <glob>", "Filter by event type (supports *)")
    .option("--follow", "Follow log output", false)
    .action(async (opts, command) => {
      const ctx = buildContext(command);
      await logsQuery(ctx.projectName, ctx.config, {
        runId: ctx.runId,
        taskId: opts.task,
        typeGlob: opts.type,
        follow: opts.follow ?? false,
        useIndex: ctx.useIndex,
      });
    });

  logs
    .command("search")
    .description("Search across run logs for a substring (grep-style)")
    .argument("<pattern>", "String to search for")
    .option("--task <id>", "Limit search to a specific task")
    .action(async (pattern, opts, command) => {
      const ctx = buildContext(command);
      await logsSearch(ctx.projectName, ctx.config, {
        runId: ctx.runId,
        pattern,
        taskId: opts.task,
        useIndex: ctx.useIndex,
      });
    });

  logs
    .command("doctor")
    .description("Show raw doctor output for a task attempt")
    .requiredOption("--task <id>", "Task ID")
    .option("--attempt <n>", "Attempt number", (v: string) => parseInt(v, 10))
    .action(async (opts, command) => {
      const ctx = buildContext(command);
      await logsDoctor(ctx.projectName, ctx.config, {
        runId: ctx.runId,
        taskId: opts.task,
        attempt: opts.attempt,
      });
    });

  logs
    .command("summarize")
    .description("Summarize validator results for a task")
    .requiredOption("--task <id>", "Task ID")
    .option("--llm", "Use LLM to summarize validator failures", false)
    .action(async (opts, command) => {
      const ctx = buildContext(command);
      await logsSummarize(ctx.projectName, ctx.config, {
        runId: ctx.runId,
        taskId: opts.task,
        useLlm: opts.llm ?? false,
      });
    });

  logs.action(async (opts, command) => {
    const ctx = buildContext(command);
    await logsQuery(ctx.projectName, ctx.config, {
      runId: ctx.runId,
      follow: opts.follow ?? false,
      useIndex: ctx.useIndex,
    });
  });
}

export async function logsQuery(
  projectName: string,
  _config: ProjectConfig,
  opts: { runId?: string; taskId?: string; typeGlob?: string; follow?: boolean; useIndex?: boolean },
): Promise<void> {
  const runLogs = resolveRunLogsOrWarn(projectName, opts.runId);
  if (!runLogs) return;

  const filter: JsonlFilter = {};
  if (opts.taskId) filter.taskId = opts.taskId;
  if (opts.typeGlob) filter.typeGlob = opts.typeGlob;

  const preferIndex = opts.useIndex ?? false;
  if (preferIndex && opts.follow) {
    console.log("--use-index is ignored when --follow is set; streaming from log file instead.");
  }

  if (preferIndex && !opts.follow) {
    const indexedLines = queryLogsFromIndex(runLogs, filter);
    if (indexedLines !== null) {
      for (const line of indexedLines) {
        console.log(line);
      }
      return;
    }
  }

  const target =
    opts.taskId === undefined
      ? path.join(runLogs.dir, "orchestrator.jsonl")
      : taskEventsLogPathForId(runLogs.dir, opts.taskId);

  if (!target) {
    console.log(`No logs found for task ${opts.taskId} in run ${runLogs.runId}.`);
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(target)) {
    console.log(`Log file not found: ${target}`);
    process.exitCode = 1;
    return;
  }

  const lines = readJsonlFile(target, filter);
  for (const line of lines) {
    console.log(line);
  }

  if (opts.follow) {
    console.log(`\nFollowing ${target} (Ctrl+C to stop)...`);
    const stop = followJsonlFile(target, filter, (newLines) => {
      for (const line of newLines) {
        console.log(line);
      }
    });

    attachExitHandlers(stop);
    await waitIndefinitely();
  }
}

export async function logsSearch(
  projectName: string,
  _config: ProjectConfig,
  opts: { runId?: string; pattern: string; taskId?: string; useIndex?: boolean },
): Promise<void> {
  const runLogs = resolveRunLogsOrWarn(projectName, opts.runId);
  if (!runLogs) return;

  const preferIndex = opts.useIndex ?? false;
  let matches: LogSearchResult[];
  if (preferIndex) {
    const indexed = trySearchWithIndex(runLogs, opts.pattern, opts.taskId);
    matches = indexed ?? searchLogs(runLogs.dir, opts.pattern, { taskId: opts.taskId });
  } else {
    matches = searchLogs(runLogs.dir, opts.pattern, { taskId: opts.taskId });
  }
  if (matches.length === 0) {
    console.log(`No matches for "${opts.pattern}" in run ${runLogs.runId}.`);
    process.exitCode = 1;
    return;
  }

  for (const match of matches) {
    const relPath = relativeToRun(runLogs.dir, match.filePath);
    console.log(`${relPath}:${match.lineNumber}:${match.line}`);
  }
}

export async function logsDoctor(
  projectName: string,
  _config: ProjectConfig,
  opts: { runId?: string; taskId: string; attempt?: number },
): Promise<void> {
  const runLogs = resolveRunLogsOrWarn(projectName, opts.runId);
  if (!runLogs) return;

  const taskDir = findTaskLogDir(runLogs.dir, opts.taskId);
  if (!taskDir) {
    console.log(`No logs directory found for task ${opts.taskId} in run ${runLogs.runId}.`);
    process.exitCode = 1;
    return;
  }

  const doctorFiles = fs
    .readdirSync(taskDir)
    .filter((file) => /^doctor-\d+\.log$/i.test(file))
    .sort();

  if (doctorFiles.length === 0) {
    console.log(`No doctor logs found for task ${opts.taskId} in run ${runLogs.runId}.`);
    process.exitCode = 1;
    return;
  }

  if (opts.attempt !== undefined && (!Number.isInteger(opts.attempt) || opts.attempt <= 0)) {
    console.log("--attempt must be a positive integer.");
    process.exitCode = 1;
    return;
  }

  const selected = pickDoctorLog(doctorFiles, opts.attempt);
  if (!selected) {
    console.log(`Doctor log for attempt ${opts.attempt} not found for task ${opts.taskId}.`);
    process.exitCode = 1;
    return;
  }

  const attemptNum = selected.attempt;
  const fullPath = path.join(taskDir, selected.fileName);
  const content = fs.readFileSync(fullPath, "utf8");

  console.log(
    `Doctor log for task ${opts.taskId} (run ${runLogs.runId}, attempt ${attemptNum}): ${fullPath}`,
  );
  process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
}

export async function logsSummarize(
  projectName: string,
  _config: ProjectConfig,
  opts: { runId?: string; taskId: string; useLlm?: boolean },
): Promise<void> {
  const runLogs = resolveRunLogsOrWarn(projectName, opts.runId);
  if (!runLogs) return;

  const stateResolved = await loadRunStateForProject(projectName, runLogs.runId);
  const taskState = stateResolved?.state.tasks[opts.taskId];
  const summaries: ValidatorSummaryRow[] = [];

  if (taskState) {
    for (const result of taskState.validator_results ?? []) {
      summaries.push({
        validator: result.validator,
        status: result.status,
        summary: result.summary ?? null,
        reportPath: result.report_path ? relativeToRun(runLogs.dir, result.report_path) : null,
      });
    }
  }

  if (!summaries.some((s) => s.validator === "test")) {
    const report = await findTestValidatorReport(runLogs.dir, opts.taskId);
    if (report) summaries.push(report);
  }

  if (!summaries.some((s) => s.validator === "doctor")) {
    const doctorReport = await findDoctorValidatorReport(runLogs.dir);
    if (doctorReport) summaries.push(doctorReport);
  }

  if (summaries.length === 0) {
    console.log(`No validator reports found for task ${opts.taskId} in run ${runLogs.runId}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Validator summaries for task ${opts.taskId} (run ${runLogs.runId}):`);
  for (const entry of summaries) {
    const summaryText = entry.summary ?? "(no summary available)";
    console.log(`- ${entry.validator}: ${entry.status} — ${summaryText}`);
    if (entry.reportPath) {
      console.log(`  Report: ${entry.reportPath}`);
    }
  }

  if (taskState?.human_review) {
    const review = taskState.human_review;
    console.log("");
    console.log(
      `Human review required by ${review.validator}: ${review.reason}${review.summary ? ` — ${review.summary}` : ""}`,
    );
    if (review.report_path) {
      console.log(`Report: ${relativeToRun(runLogs.dir, review.report_path)}`);
    }
  }

  if (opts.useLlm) {
    console.log("");
    console.log("LLM summarization flag provided; showing rule-based summary (LLM optional).");
  }
}

async function findTestValidatorReport(
  runLogsDir: string,
  taskId: string,
): Promise<ValidatorSummaryRow | null> {
  const dir = path.join(runLogsDir, "validators", "test-validator");
  const reportPath = await pickLatestJson(dir, (name) => name.startsWith(`${taskId}-`));
  if (!reportPath) return null;

  const report = readValidatorResultFromFile<TestValidationReport>(reportPath);
  if (!report) return null;

  const status = report.pass ? "pass" : "fail";
  return {
    validator: "test",
    status,
    summary: summarizeTestReport(report),
    reportPath: relativeToRun(runLogsDir, reportPath),
  };
}

async function findDoctorValidatorReport(runLogsDir: string): Promise<ValidatorSummaryRow | null> {
  const dir = path.join(runLogsDir, "validators", "doctor-validator");
  const reportPath = await pickLatestJson(dir);
  if (!reportPath) return null;

  const report = readValidatorResultFromFile<DoctorValidationReport>(reportPath);
  if (!report) return null;

  const status = report.effective ? "pass" : "fail";
  return {
    validator: "doctor",
    status,
    summary: summarizeDoctorReport(report),
    reportPath: relativeToRun(runLogsDir, reportPath),
  };
}

async function pickLatestJson(
  dir: string,
  matcher: (name: string) => boolean = () => true,
): Promise<string | null> {
  if (!fs.existsSync(dir)) return null;

  const files = fs
    .readdirSync(dir)
    .filter((file) => file.toLowerCase().endsWith(".json") && matcher(file));
  if (files.length === 0) return null;

  const withTime = files
    .map((file) => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      return { fullPath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return withTime[0]?.fullPath ?? null;
}

function readValidatorResultFromFile<T>(filePath: string): T | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const payload = (raw as { result?: unknown }).result;
    if (!payload || typeof payload !== "object") {
      return null;
    }
    return payload as T;
  } catch {
    return null;
  }
}

function summarizeTestReport(report: TestValidationReport): string {
  const parts = [report.summary];
  if (report.concerns.length > 0) {
    parts.push(`Concerns: ${report.concerns.length}`);
  }
  if (report.coverage_gaps.length > 0) {
    parts.push(`Coverage gaps: ${report.coverage_gaps.length}`);
  }
  return parts.filter(Boolean).join(" | ");
}

function summarizeDoctorReport(report: DoctorValidationReport): string {
  const parts = [
    `Effective: ${report.effective ? "yes" : "no"}`,
    `Coverage: ${report.coverage_assessment}`,
  ];
  if (report.concerns.length > 0) {
    parts.push(`Concerns: ${report.concerns.length}`);
  }
  if (report.recommendations.length > 0) {
    parts.push(`Recs: ${report.recommendations.length}`);
  }
  return parts.join(" | ");
}

function queryLogsFromIndex(
  runLogs: { runId: string; dir: string },
  filter: JsonlFilter,
): string[] | null {
  const dbPath = logIndexPath(runLogs.dir);
  const indexFilter: LogIndexQuery = {};
  if (filter.taskId) indexFilter.taskId = filter.taskId;
  if (filter.typeGlob) indexFilter.typeGlob = filter.typeGlob;

  let index: LogIndex | null = null;
  try {
    index = LogIndex.open(runLogs.runId, runLogs.dir, dbPath);
    index.ingestRunLogs(runLogs.dir);
    const events = index.queryEvents(indexFilter);
    return events.map((event) => event.raw);
  } catch (err) {
    console.log(
      `Log index unavailable at ${dbPath} (${(err as Error).message}). Falling back to JSONL files.`,
    );
    return null;
  } finally {
    if (index) index.close();
  }
}

function trySearchWithIndex(
  runLogs: { runId: string; dir: string },
  pattern: string,
  taskId?: string,
): LogSearchResult[] | null {
  const dbPath = logIndexPath(runLogs.dir);
  let index: LogIndex | null = null;
  try {
    index = LogIndex.open(runLogs.runId, runLogs.dir, dbPath);
    index.ingestRunLogs(runLogs.dir);
    const events = index.queryEvents({ taskId, search: pattern });
    return events.map((event) => ({
      filePath: path.join(runLogs.dir, event.source),
      lineNumber: event.lineNumber,
      line: event.raw,
    }));
  } catch (err) {
    console.log(
      `Log index unavailable at ${dbPath} (${(err as Error).message}). Falling back to file search.`,
    );
    return null;
  } finally {
    if (index) index.close();
  }
}

function buildContext(command: Command): {
  projectName: string;
  runId?: string;
  config: ProjectConfig;
  useIndex: boolean;
} {
  const opts = command.optsWithGlobals() as {
    project?: string;
    runId?: string;
    config?: string;
    useIndex?: boolean;
  };
  if (!opts.project) {
    throw new Error("Project name is required");
  }

  const configPath = opts.config ?? projectConfigPath(opts.project);
  const config = loadProjectConfig(configPath);

  return { projectName: opts.project, runId: opts.runId, config, useIndex: opts.useIndex ?? false };
}

function resolveRunLogsOrWarn(
  projectName: string,
  runId?: string,
): { runId: string; dir: string } | null {
  const resolved = resolveRunLogsDir(projectName, runId);
  if (resolved) {
    return resolved;
  }

  const message = runId
    ? `Run ${runId} not found for project ${projectName}.`
    : `No runs found for project ${projectName}.`;
  console.log(message);
  process.exitCode = 1;
  return null;
}

function pickDoctorLog(
  files: string[],
  attempt?: number,
): { attempt: number; fileName: string } | null {
  const parsed = files
    .map((file) => {
      const match = file.match(/^doctor-(\d+)\.log$/i);
      return match ? { fileName: file, attempt: Number.parseInt(match[1], 10) } : null;
    })
    .filter(Boolean) as { attempt: number; fileName: string }[];

  if (parsed.length === 0) return null;

  if (attempt !== undefined) {
    return parsed.find((item) => item.attempt === attempt) ?? null;
  }

  return parsed.sort((a, b) => b.attempt - a.attempt)[0];
}

function relativeToRun(baseDir: string, targetPath: string): string {
  const relative = path.relative(baseDir, targetPath);
  return relative.startsWith("..") ? targetPath : relative;
}

function attachExitHandlers(cleanup: () => void): void {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.once(signal, () => {
      cleanup();
      process.exit();
    });
  }
}

function waitIndefinitely(): Promise<void> {
  return new Promise(() => undefined);
}
