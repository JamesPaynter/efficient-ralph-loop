import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkerStateStore, loadWorkerState, workerStatePath } from "./state.js";

describe("WorkerStateStore", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "worker-state-"));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("records attempts and thread ids", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));

    const store = new WorkerStateStore(workspace);
    await store.load();

    expect(store.nextAttempt).toBe(1);

    await store.recordAttemptStart(1);
    const first = await loadWorkerState(workspace);
    expect(first?.attempt).toBe(1);
    expect(first?.thread_id).toBeUndefined();
    expect(first?.created_at).toBe("2024-01-01T00:00:00.000Z");
    expect(first?.checkpoints).toEqual([]);

    vi.setSystemTime(new Date("2024-01-01T00:05:00Z"));
    await store.recordThreadId("thread-123");
    const withThread = await loadWorkerState(workspace);
    expect(withThread?.thread_id).toBe("thread-123");
    expect(withThread?.attempt).toBe(1);
    expect(withThread?.created_at).toBe(first?.created_at);
    expect(withThread?.checkpoints).toEqual([]);
    expect(store.nextAttempt).toBe(2);
  });

  it("records checkpoint commits per attempt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T00:00:00Z"));

    const store = new WorkerStateStore(workspace);
    await store.recordAttemptStart(1);
    await store.recordCheckpoint(1, "abc123");

    vi.setSystemTime(new Date("2024-06-01T01:00:00Z"));
    await store.recordAttemptStart(2);
    await store.recordCheckpoint(2, "def456");
    // Overwrite attempt 1 checkpoint to verify deduping
    await store.recordCheckpoint(1, "abc999");

    const state = await loadWorkerState(workspace);
    expect(state?.checkpoints).toEqual([
      { attempt: 1, sha: "abc999", created_at: "2024-06-01T01:00:00.000Z" },
      { attempt: 2, sha: "def456", created_at: "2024-06-01T01:00:00.000Z" },
    ]);
  });

  it("returns null when state is missing", async () => {
    const result = await loadWorkerState(workspace);
    expect(result).toBeNull();
    expect(fs.existsSync(workerStatePath(workspace))).toBe(false);
  });
});
