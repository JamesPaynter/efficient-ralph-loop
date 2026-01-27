import fs from "node:fs/promises";
import path from "node:path";

import { execa, execaCommand } from "execa";

import type { BootstrapCommandSummary } from "./attempt-summary.js";
import { safeAttemptName, writeRunLog, type WorkerLogger } from "./logging.js";
import { OUTPUT_PREVIEW_LIMIT } from "./loop-constants.js";

// =============================================================================
// WORKER FAIL-ONCE
// =============================================================================

export async function maybeFailWorkerOnce(args: {
  workingDirectory: string;
  log: WorkerLogger;
}): Promise<void> {
  const raw = process.env.MYCELIUM_WORKER_FAIL_ONCE_FILE?.trim();
  if (!raw) return;

  // Test-only guard to simulate a worker crash once per run.
  const guardPath = path.isAbsolute(raw) ? raw : path.join(args.workingDirectory, raw);

  try {
    await fs.stat(guardPath);
    return;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  await fs.mkdir(path.dirname(guardPath), { recursive: true });
  await fs.writeFile(guardPath, "fail-once\n", "utf8");
  args.log.log({ type: "worker.fail_once", payload: { file: guardPath } });

  throw new Error("Worker forced to fail once via MYCELIUM_WORKER_FAIL_ONCE_FILE");
}

// =============================================================================
// BOOTSTRAP COMMANDS
// =============================================================================

export async function runBootstrap(args: {
  commands: string[];
  cwd: string;
  log: WorkerLogger;
  runLogsDir: string;
  env?: NodeJS.ProcessEnv;
}): Promise<BootstrapCommandSummary[]> {
  const cmds = args.commands.filter((cmd) => cmd.trim().length > 0);
  if (cmds.length === 0) {
    return [];
  }

  const summaries: BootstrapCommandSummary[] = [];
  args.log.log({ type: "bootstrap.start", payload: { command_count: cmds.length } });

  for (let i = 0; i < cmds.length; i += 1) {
    const cmd = cmds[i];
    args.log.log({ type: "bootstrap.cmd.start", payload: { cmd, index: i } });

    const res = await execaCommand(cmd, {
      cwd: args.cwd,
      shell: true,
      reject: false,
      stdio: "pipe",
      env: args.env ?? process.env,
    });

    const output = `${res.stdout}\n${res.stderr}`.trim();
    const logFile = output ? `bootstrap-${safeAttemptName(i + 1)}.log` : undefined;
    if (logFile) {
      writeRunLog(args.runLogsDir, logFile, output + "\n");
    }

    const stdoutPreview = truncateText(res.stdout, OUTPUT_PREVIEW_LIMIT);
    const stderrPreview = truncateText(res.stderr, OUTPUT_PREVIEW_LIMIT);
    const exitCode = res.exitCode ?? -1;

    const summary: BootstrapCommandSummary = {
      index: i + 1,
      command: cmd,
      exit_code: exitCode,
    };
    if (output.length > 0) {
      summary.output_preview = output.slice(0, OUTPUT_PREVIEW_LIMIT);
    }
    if (logFile) {
      summary.log_path = logFile;
    }
    summaries.push(summary);

    args.log.log({
      type: exitCode === 0 ? "bootstrap.cmd.complete" : "bootstrap.cmd.fail",
      payload: {
        cmd,
        exit_code: exitCode,
        stdout: stdoutPreview.text,
        stdout_truncated: stdoutPreview.truncated,
        stderr: stderrPreview.text,
        stderr_truncated: stderrPreview.truncated,
      },
    });

    if (exitCode !== 0) {
      throw new Error(`Bootstrap command failed: "${cmd}" exited with ${exitCode}`);
    }
  }

  args.log.log({ type: "bootstrap.complete" });
  return summaries;
}

// =============================================================================
// VERIFICATION COMMANDS
// =============================================================================

export async function runVerificationCommand(args: {
  command: string;
  cwd: string;
  timeoutSeconds?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<{ exitCode: number; output: string }> {
  const res = await execaCommand(args.command, {
    cwd: args.cwd,
    shell: true,
    reject: false,
    timeout: args.timeoutSeconds ? args.timeoutSeconds * 1000 : undefined,
    stdio: "pipe",
    env: args.env ?? process.env,
  });

  const exitCode = res.exitCode ?? -1;
  const output = `${res.stdout}\n${res.stderr}`.trim();
  return { exitCode, output };
}

// =============================================================================
// GIT IDENTITY
// =============================================================================

export async function ensureGitIdentity(cwd: string, log: WorkerLogger): Promise<void> {
  const nameRes = await execa("git", ["config", "--get", "user.name"], {
    cwd,
    reject: false,
    stdio: "pipe",
  });
  if (nameRes.exitCode !== 0 || nameRes.stdout.trim().length === 0) {
    await execa("git", ["config", "user.name", "mycelium"], { cwd });
    log.log({ type: "git.identity.set", payload: { field: "user.name" } });
  }

  const emailRes = await execa("git", ["config", "--get", "user.email"], {
    cwd,
    reject: false,
    stdio: "pipe",
  });
  if (emailRes.exitCode !== 0 || emailRes.stdout.trim().length === 0) {
    await execa("git", ["config", "user.email", "mycelium@localhost"], { cwd });
    log.log({ type: "git.identity.set", payload: { field: "user.email" } });
  }
}

// =============================================================================
// GIT CHANGE TRACKING
// =============================================================================

type GitStatusEntry = {
  path: string;
  status: string;
};

export async function listChangedEntries(cwd: string): Promise<GitStatusEntry[]> {
  const status = await execa("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd,
    stdio: "pipe",
  });

  return status.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => {
      const statusCode = line.length >= 2 ? line.slice(0, 2) : line;
      const pathText = line.length > 3 ? line.slice(3).trim() : "";
      const target = pathText.includes(" -> ")
        ? (pathText.split(" -> ").pop() ?? pathText)
        : pathText;
      return { status: statusCode, path: normalizeToPosix(target) };
    })
    .filter((entry) => entry.path.length > 0);
}

export async function listChangedPaths(cwd: string): Promise<string[]> {
  const status = await execa("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd,
    stdio: "pipe",
  });

  return status.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => {
      const pathText = line.length > 3 ? line.slice(3).trim() : line;
      const target = pathText.includes(" -> ")
        ? (pathText.split(" -> ").pop() ?? pathText)
        : pathText;
      return normalizeToPosix(target);
    })
    .filter((file) => file.length > 0);
}

export async function cleanNonTestChanges(args: {
  cwd: string;
  files: string[];
  log: WorkerLogger;
  attempt: number;
}): Promise<void> {
  if (args.files.length === 0) {
    return;
  }

  const entries = await listChangedEntries(args.cwd);
  const entryMap = new Map(entries.map((entry) => [entry.path, entry.status]));
  const tracked: string[] = [];
  const untracked: string[] = [];

  for (const file of args.files) {
    if (entryMap.get(file) === "??") {
      untracked.push(file);
    } else {
      tracked.push(file);
    }
  }

  if (tracked.length > 0) {
    const restore = await execa(
      "git",
      ["restore", "--source=HEAD", "--staged", "--worktree", "--", ...tracked],
      { cwd: args.cwd, reject: false, stdio: "pipe" },
    );
    if (restore.exitCode !== 0) {
      args.log.log({
        type: "git.restore.fail",
        attempt: args.attempt,
        payload: { exit_code: restore.exitCode ?? -1 },
      });
    }
  }

  if (untracked.length > 0) {
    const clean = await execa("git", ["clean", "-fd", "--", ...untracked], {
      cwd: args.cwd,
      reject: false,
      stdio: "pipe",
    });
    if (clean.exitCode !== 0) {
      args.log.log({
        type: "git.clean.fail",
        attempt: args.attempt,
        payload: { exit_code: clean.exitCode ?? -1 },
      });
    }
  }
}

export function diffChangedPaths(before: string[], after: string[]): string[] {
  const beforeSet = new Set(before);
  return after.filter((file) => !beforeSet.has(file)).sort();
}

export function filterInternalChanges(
  files: string[],
  workingDirectory: string,
  runLogsDir: string,
): string[] {
  const logsRelative = normalizeToPosix(path.relative(workingDirectory, runLogsDir));
  return files.filter((file) => {
    if (file === ".mycelium/worker-state.json") return false;
    if (file.startsWith(".mycelium/codex-home/")) return false;
    if (file.startsWith(".git/")) return false;
    if (logsRelative && !logsRelative.startsWith("..") && logsRelative !== ".") {
      if (file === logsRelative || file.startsWith(`${logsRelative}/`)) return false;
    }
    return true;
  });
}

function normalizeToPosix(input: string): string {
  return input.replace(/\\/g, "/");
}

// =============================================================================
// TEXT UTILITIES
// =============================================================================

export function truncateText(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, limit), truncated: true };
}
