import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { execa } from "execa";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadProjectConfig } from "../core/config-loader.js";
import { DockerError, GitError, UserFacingError, USER_FACING_ERROR_CODES } from "../core/errors.js";
import { buildWorkerImage } from "../docker/image.js";
import { ensureCleanWorkingTree } from "../git/git.js";

// =============================================================================
// TEST SETUP
// =============================================================================

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

const execaMock = vi.mocked(execa);
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;

  execaMock.mockReset();
});

// =============================================================================
// HELPERS
// =============================================================================

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

// =============================================================================
// TESTS
// =============================================================================

describe("error mapping", () => {
  it("maps dirty git working trees to a user-facing error", async () => {
    execaMock.mockResolvedValueOnce({
      stdout: " M src/index.ts\n",
      stderr: "",
      exitCode: 0,
    } as Awaited<ReturnType<typeof execa>>);

    const result = await ensureCleanWorkingTree("/repo").catch((err) => err);

    expect(result).toBeInstanceOf(UserFacingError);
    const userError = result as UserFacingError;
    expect(userError.code).toBe(USER_FACING_ERROR_CODES.git);
    expect(userError.title).toBe("Git working tree has uncommitted changes.");
    expect(userError.message).toBe("Git working tree has uncommitted changes.");
    expect(userError.hint).toContain("Commit or stash your changes");
    expect(userError.cause).toBeInstanceOf(GitError);
    expect((userError.cause as GitError).message).toContain("uncommitted changes");
  });

  it("maps missing config paths to a user-facing config error", () => {
    const dir = makeTempDir("error-mapping-config-");
    const configPath = path.join(dir, "missing-config.yaml");
    const resolvedPath = path.resolve(configPath);

    let error: unknown;
    try {
      loadProjectConfig(configPath);
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(UserFacingError);
    const userError = error as UserFacingError;
    expect(userError.code).toBe(USER_FACING_ERROR_CODES.config);
    expect(userError.title).toBe("Project config missing.");
    expect(userError.message).toContain(resolvedPath);
    expect(userError.hint).toContain("mycelium init");
  });

  it("maps docker build failures to a user-facing error", async () => {
    const error = Object.assign(new Error("docker build failed"), {
      stderr: 'failed to solve: process "/bin/sh" did not complete',
      code: "2",
    });

    execaMock.mockRejectedValueOnce(error);

    const result = await buildWorkerImage({
      tag: "worker:latest",
      dockerfile: "Dockerfile",
      context: ".",
    }).catch((err) => err);

    expect(result).toBeInstanceOf(UserFacingError);
    const userError = result as UserFacingError;
    expect(userError.code).toBe(USER_FACING_ERROR_CODES.docker);
    expect(userError.title).toBe("Docker build failed.");
    expect(userError.message).toContain("worker:latest");
    expect(userError.hint).toContain("Docker build output");
    expect(userError.hint).not.toContain("--local-worker");
    expect(userError.cause).toBeInstanceOf(DockerError);
    expect((userError.cause as DockerError).message).toContain("docker build failed");
    expect((userError.cause as DockerError).cause).toBe(error);
  });
});
