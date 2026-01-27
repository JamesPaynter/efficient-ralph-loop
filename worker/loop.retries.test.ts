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

describe("runWorker max retries", () => {
  let workspace: string;
  let manifestPath: string;
  let specPath: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "worker-loop-retries-"));
    await execa("git", ["init"], { cwd: workspace });
    await execa("git", ["config", "user.email", "tester@example.com"], { cwd: workspace });
    await execa("git", ["config", "user.name", "Tester"], { cwd: workspace });

    manifestPath = path.join(workspace, "manifest.json");
    specPath = path.join(workspace, "spec.md");

    const manifest = {
      id: "RETRY0",
      name: "Unlimited retries task",
      verify: { doctor: "bash -c 'exit 0'" },
    };

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    await fs.writeFile(specPath, "# Spec\n\nRetry forever\n", "utf8");

    await execa("git", ["add", "-A"], { cwd: workspace });
    await execa("git", ["commit", "-m", "init"], { cwd: workspace });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    __setMockCodexHandler(null);
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it("accepts maxRetries=0 as unlimited", async () => {
    const runLogsDir = path.join(workspace, "logs");
    const config = {
      taskId: "RETRY0",
      taskSlug: "retry0",
      manifestPath,
      specPath,
      doctorCmd: "bash -c 'exit 0'",
      maxRetries: 0,
      bootstrapCmds: [],
      runLogsDir,
      codexHome: path.join(workspace, ".mycelium", "codex-home"),
      workingDirectory: workspace,
      checkpointCommits: false,
    };

    await runWorker(config, { log: vi.fn() });

    await expect(
      fs.readFile(path.join(runLogsDir, "attempt-001.summary.json"), "utf8"),
    ).resolves.toBeTruthy();
  });
});
