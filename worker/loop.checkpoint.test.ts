import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { execa } from "execa";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockCodexContext = {
  input: string;
  turn: number;
  workingDirectory: string;
};

type MockCodexHandler = (context: MockCodexContext) => Promise<void> | void;

let mockCodexHandler: MockCodexHandler | null = null;

function setMockCodexHandler(handler: MockCodexHandler | null): void {
  mockCodexHandler = handler;
}

vi.mock("./codex.js", () => {
  class MockRunner {
    threadId = "mock-thread";
    private turn = 0;
    private started = false;

    constructor(private readonly opts: { workingDirectory: string }) {}

    async streamPrompt(input: string, handlers: any): Promise<void> {
      this.turn += 1;
      if (!this.started) {
        this.started = true;
        await handlers.onThreadStarted?.(this.threadId);
      } else {
        await handlers.onThreadResumed?.(this.threadId);
      }

      if (mockCodexHandler) {
        await mockCodexHandler({
          input,
          turn: this.turn,
          workingDirectory: this.opts.workingDirectory,
        });
      }
    }
  }

  return {
    CodexRunner: MockRunner,
    createCodexRunner: (opts: { workingDirectory: string }) => new MockRunner(opts),
    __setMockCodexHandler: setMockCodexHandler,
  };
});

import { __setMockCodexHandler } from "./codex.js";
import { runWorker } from "./loop.js";
import { loadWorkerState, workerStatePath } from "./state.js";

describe("runWorker checkpoint commits", () => {
  let workspace: string;
  let manifestPath: string;
  let specPath: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "worker-loop-"));
    await execa("git", ["init"], { cwd: workspace });
    await execa("git", ["config", "user.email", "tester@example.com"], { cwd: workspace });
    await execa("git", ["config", "user.name", "Tester"], { cwd: workspace });

    manifestPath = path.join(workspace, "manifest.json");
    specPath = path.join(workspace, "spec.md");
    await fs.writeFile(
      manifestPath,
      JSON.stringify({ id: "T1", name: "Checkpoint task" }, null, 2),
      "utf8",
    );
    await fs.writeFile(specPath, "# Spec\n\nDo things\n", "utf8");

    await execa("git", ["add", "-A"], { cwd: workspace });
    await execa("git", ["commit", "-m", "init"], { cwd: workspace });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    __setMockCodexHandler(null);
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it("creates a checkpoint commit when doctor fails", async () => {
    await fs.writeFile(path.join(workspace, "notes.txt"), "pending change\n", "utf8");

    const config = {
      taskId: "T1",
      taskSlug: "t1",
      manifestPath,
      specPath,
      doctorCmd: "bash -c 'exit 1'",
      maxRetries: 1,
      bootstrapCmds: [],
      runLogsDir: path.join(workspace, "logs"),
      codexHome: path.join(workspace, ".mycelium", "codex-home"),
      workingDirectory: workspace,
      checkpointCommits: true,
    };

    await expect(runWorker(config, { log: vi.fn() })).rejects.toThrow(/Max retries exceeded/);

    const headMessage = (
      await execa("git", ["log", "-1", "--pretty=%s"], { cwd: workspace })
    ).stdout.trim();
    expect(headMessage).toContain("WIP(Task T1): attempt 1 checkpoint");

    const headSha = (
      await execa("git", ["rev-parse", "HEAD"], { cwd: workspace, stdio: "pipe" })
    ).stdout.trim();
    const state = await loadWorkerState(workspace);
    expect(state?.checkpoints).toEqual([
      {
        attempt: 1,
        sha: headSha,
        created_at: state?.checkpoints[0]?.created_at,
      },
    ]);
    expect(await fs.stat(workerStatePath(workspace))).toBeTruthy();
  });

  it("amends the checkpoint commit into a final commit when doctor passes", async () => {
    await fs.writeFile(path.join(workspace, "notes.txt"), "pending change\n", "utf8");

    const config = {
      taskId: "T1",
      taskSlug: "t1",
      manifestPath,
      specPath,
      doctorCmd: "bash -c 'exit 0'",
      maxRetries: 1,
      bootstrapCmds: [],
      runLogsDir: path.join(workspace, "logs"),
      codexHome: path.join(workspace, ".mycelium", "codex-home"),
      workingDirectory: workspace,
      checkpointCommits: true,
    };

    await runWorker(config, { log: vi.fn() });

    const headMessage = (
      await execa("git", ["log", "-1", "--pretty=%s"], { cwd: workspace })
    ).stdout.trim();
    expect(headMessage).toMatch(/^\[FEAT\] T1/);

    const headSha = (
      await execa("git", ["rev-parse", "HEAD"], { cwd: workspace, stdio: "pipe" })
    ).stdout.trim();
    const state = await loadWorkerState(workspace);
    expect(state?.checkpoints).toEqual([
      {
        attempt: 1,
        sha: headSha,
        created_at: state?.checkpoints[0]?.created_at,
      },
    ]);
  });
});
