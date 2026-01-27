import { afterEach, describe, expect, it, vi } from "vitest";

import { RunStateSchema } from "./state.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("run state schema", () => {
  it("accepts legacy state without control_plane metadata", () => {
    const legacyState = {
      run_id: "legacy-run",
      project: "demo",
      repo_path: "/repo",
      main_branch: "main",
      started_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      status: "running",
      batches: [],
      tasks: {},
      tokens_used: 0,
      estimated_cost: 0,
    };

    const parsed = RunStateSchema.safeParse(legacyState);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.control_plane).toBeUndefined();
    }
  });
});
