import { describe, expect, it } from "vitest";

import type { WorkerCheckpoint } from "../../worker/state.js";

import { checkpointListsEqual, mergeCheckpointCommits } from "./executor.js";
import type { CheckpointCommit } from "./state.js";

describe("mergeCheckpointCommits", () => {
  it("merges and sorts checkpoints by attempt", () => {
    const existing: CheckpointCommit[] = [
      { attempt: 1, sha: "old1", created_at: "2024-01-01T00:00:00Z" },
      { attempt: 3, sha: "old3", created_at: "2024-01-03T00:00:00Z" },
    ];
    const incoming: WorkerCheckpoint[] = [
      { attempt: 2, sha: "new2", created_at: "2024-01-02T00:00:00Z" },
      { attempt: 1, sha: "new1", created_at: "2024-01-01T01:00:00Z" },
    ];

    expect(mergeCheckpointCommits(existing, incoming)).toEqual([
      { attempt: 1, sha: "new1", created_at: "2024-01-01T01:00:00Z" },
      { attempt: 2, sha: "new2", created_at: "2024-01-02T00:00:00Z" },
      { attempt: 3, sha: "old3", created_at: "2024-01-03T00:00:00Z" },
    ]);
  });

  it("detects equality when lists match", () => {
    const left: CheckpointCommit[] = [
      { attempt: 1, sha: "abc", created_at: "2024-01-01T00:00:00Z" },
      { attempt: 2, sha: "def", created_at: "2024-01-02T00:00:00Z" },
    ];
    const right: CheckpointCommit[] = [
      { attempt: 1, sha: "abc", created_at: "2024-01-01T00:00:00Z" },
      { attempt: 2, sha: "def", created_at: "2024-01-02T00:00:00Z" },
    ];

    expect(checkpointListsEqual(left, right)).toBe(true);
    expect(
      checkpointListsEqual(left, [
        { attempt: 1, sha: "abc", created_at: "2024-01-01T00:00:00Z" },
        { attempt: 2, sha: "changed", created_at: "2024-01-02T00:00:00Z" },
      ]),
    ).toBe(false);
  });
});
