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

describe("runWorker lint step", () => {
  let workspace: string;
  let manifestPath: string;
  let specPath: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "worker-loop-lint-"));
    await execa("git", ["init"], { cwd: workspace });
    await execa("git", ["config", "user.email", "tester@example.com"], { cwd: workspace });
    await execa("git", ["config", "user.name", "Tester"], { cwd: workspace });

    manifestPath = path.join(workspace, "manifest.json");
    specPath = path.join(workspace, "spec.md");

    const lintFlag = path.join(workspace, ".lint-ok");
    const lintCmd = `bash -c 'if [ ! -f "${lintFlag}" ]; then echo "lint failed"; touch "${lintFlag}"; exit 1; fi; echo "lint ok"'`;

    const manifest = {
      id: "LINT1",
      name: "Lint task",
      verify: { doctor: "bash -c 'exit 0'", lint: lintCmd },
    };

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    await fs.writeFile(specPath, "# Spec\n\nHandle lint\n", "utf8");

    await execa("git", ["add", "-A"], { cwd: workspace });
    await execa("git", ["commit", "-m", "init"], { cwd: workspace });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    __setMockCodexHandler(null);
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it("retries when lint fails before doctor", async () => {
    const doctorLog = path.join(workspace, "doctor.log");
    const runLogsDir = path.join(workspace, "logs");

    const config = {
      taskId: "LINT1",
      taskSlug: "lint1",
      manifestPath,
      specPath,
      doctorCmd: `bash -c 'echo doctor >> "${doctorLog}"'`,
      maxRetries: 2,
      bootstrapCmds: [],
      runLogsDir,
      codexHome: path.join(workspace, ".mycelium", "codex-home"),
      workingDirectory: workspace,
      checkpointCommits: false,
    };

    await runWorker(config, { log: vi.fn() });

    const lintAttempt1 = await fs.readFile(path.join(runLogsDir, "lint-attempt-001.log"), "utf8");
    const lintAttempt2 = await fs.readFile(path.join(runLogsDir, "lint-attempt-002.log"), "utf8");

    expect(lintAttempt1).toContain("lint failed");
    expect(lintAttempt2).toContain("lint ok");

    const doctorRuns = (await fs.readFile(doctorLog, "utf8")).trim().split("\n").filter(Boolean);
    expect(doctorRuns).toHaveLength(1);
  });
});
