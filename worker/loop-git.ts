import { execa } from "execa";

import type { WorkerLogger } from "./logging.js";
import type { TaskManifest } from "./loop.js";
import { WorkerStateStore } from "./state.js";

// =============================================================================
// GIT HELPERS
// =============================================================================

export async function maybeCheckpointCommit(args: {
  cwd: string;
  taskId: string;
  attempt: number;
  log: WorkerLogger;
  workerState: WorkerStateStore;
}): Promise<void> {
  const status = await execa("git", ["status", "--porcelain"], {
    cwd: args.cwd,
    stdio: "pipe",
  });
  if (status.stdout.trim().length === 0) {
    args.log.log({
      type: "git.checkpoint.skip",
      attempt: args.attempt,
      payload: { reason: "no_changes" },
    });
    return;
  }

  await execa("git", ["add", "-A"], { cwd: args.cwd });

  const message = buildCheckpointCommitMessage(args.taskId, args.attempt);
  const commit = await execa("git", ["commit", "-m", message], {
    cwd: args.cwd,
    reject: false,
    stdio: "pipe",
  });

  if (commit.exitCode === 0) {
    const sha = await readHeadSha(args.cwd);
    await args.workerState.recordCheckpoint(args.attempt, sha);
    args.log.log({ type: "git.checkpoint", attempt: args.attempt, payload: { sha } });
    return;
  }

  const statusAfter = await execa("git", ["status", "--porcelain"], {
    cwd: args.cwd,
    stdio: "pipe",
  });
  if (statusAfter.stdout.trim().length === 0) {
    args.log.log({
      type: "git.checkpoint.skip",
      attempt: args.attempt,
      payload: { reason: "nothing_to_commit" },
    });
    return;
  }

  throw new Error(`git checkpoint commit failed: ${commit.stderr || commit.stdout}`);
}

export async function maybeCommit(args: {
  cwd: string;
  manifest: TaskManifest;
  taskId: string;
  attempt: number;
  log: WorkerLogger;
  workerState?: WorkerStateStore;
}): Promise<void> {
  const status = await execa("git", ["status", "--porcelain"], {
    cwd: args.cwd,
    stdio: "pipe",
  });

  const taskName =
    typeof args.manifest.name === "string" && args.manifest.name.trim().length > 0
      ? args.manifest.name
      : args.taskId;
  const message = `[FEAT] ${args.taskId} ${taskName}\n\nTask: ${args.taskId}`;

  if (status.stdout.trim().length === 0) {
    const headMessage = await readHeadCommitMessage(args.cwd);
    if (isCheckpointCommitMessage(headMessage, args.taskId)) {
      const amend = await execa("git", ["commit", "--amend", "-m", message], {
        cwd: args.cwd,
        reject: false,
        stdio: "pipe",
      });

      if (amend.exitCode !== 0) {
        throw new Error(`git commit amend failed: ${amend.stderr || amend.stdout}`);
      }

      const sha = await readHeadSha(args.cwd);
      if (args.workerState) {
        await args.workerState.recordCheckpoint(args.attempt, sha);
      }
      args.log.log({
        type: "git.commit",
        attempt: args.attempt,
        payload: { sha, amended_checkpoint: true },
      });
      return;
    }

    args.log.log({
      type: "git.commit.skip",
      attempt: args.attempt,
      payload: { reason: "no_changes" },
    });
    return;
  }

  await execa("git", ["add", "-A"], { cwd: args.cwd });

  const commit = await execa("git", ["commit", "-m", message], {
    cwd: args.cwd,
    reject: false,
    stdio: "pipe",
  });

  if (commit.exitCode === 0) {
    const sha = await readHeadSha(args.cwd);
    if (args.workerState) {
      await args.workerState.recordCheckpoint(args.attempt, sha);
    }
    args.log.log({ type: "git.commit", attempt: args.attempt, payload: { sha } });
    return;
  }

  const statusAfter = await execa("git", ["status", "--porcelain"], {
    cwd: args.cwd,
    stdio: "pipe",
  });
  if (statusAfter.stdout.trim().length === 0) {
    args.log.log({
      type: "git.commit.skip",
      attempt: args.attempt,
      payload: { reason: "nothing_to_commit" },
    });
    return;
  }

  throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
}

export async function readHeadCommitMessage(cwd: string): Promise<string | null> {
  try {
    const res = await execa("git", ["log", "-1", "--pretty=%B"], { cwd, stdio: "pipe" });
    const message = res.stdout.trim();
    return message.length > 0 ? message : null;
  } catch {
    return null;
  }
}

export async function readHeadSha(cwd: string): Promise<string> {
  const res = await execa("git", ["rev-parse", "HEAD"], { cwd, stdio: "pipe" });
  return res.stdout.trim();
}

export function buildCheckpointCommitMessage(taskId: string, attempt: number): string {
  return `WIP(Task ${taskId}): attempt ${attempt} checkpoint`;
}

export function isCheckpointCommitMessage(message: string | null, taskId: string): boolean {
  if (!message) return false;
  const firstLine = message.split("\n")[0]?.trim() ?? "";
  return (
    firstLine.startsWith(`WIP(Task ${taskId})`) && firstLine.toLowerCase().includes("checkpoint")
  );
}
