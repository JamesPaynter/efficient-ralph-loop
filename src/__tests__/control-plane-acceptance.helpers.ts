import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Command } from "commander";
import { execa } from "execa";
import fse from "fs-extra";
import { expect, vi } from "vitest";

import { buildCli } from "../cli/index.js";
import type {
  ControlPlaneComponent,
  ControlPlaneDependencyEdge,
  ControlPlaneSymbolDefinition,
  ControlPlaneSymbolReference,
} from "../control-plane/model/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = path.resolve(__dirname, "../../test/fixtures/control-plane-mini-repo");
const tempDirs: string[] = [];

export const EXPECTED_COMPONENTS: ControlPlaneComponent[] = [
  {
    id: "acme-web-app",
    name: "@acme/web-app",
    roots: ["apps/web"],
    kind: "app",
    language_hints: ["ts"],
  },
  {
    id: "acme-infra-terraform",
    name: "@acme/infra-terraform",
    roots: ["infra/terraform"],
    kind: "infra",
    language_hints: ["js"],
  },
  {
    id: "acme-utils",
    name: "@acme/utils",
    roots: ["packages/utils"],
    kind: "lib",
    language_hints: ["ts"],
  },
];

// =============================================================================
// HELPERS
// =============================================================================

export type JsonEnvelope<T> =
  | { ok: true; result: T }
  | { ok: false; error: { code: string; message: string; details: unknown } };

export type SymbolFindResult = {
  query: string;
  total: number;
  limit: number;
  truncated: boolean;
  matches: ControlPlaneSymbolDefinition[];
};

export type SymbolDefinitionResult = {
  symbol_id: string;
  definition: ControlPlaneSymbolDefinition | null;
  snippet: { start_line: number; lines: string[] } | null;
};

export type SymbolReferencesResult = {
  symbol_id: string;
  definition: ControlPlaneSymbolDefinition | null;
  total: number;
  limit: number;
  truncated: boolean;
  group_by: string | null;
  references: ControlPlaneSymbolReference[];
  groups: Array<{ key: string; references: ControlPlaneSymbolReference[] }> | null;
};

export async function createTempRepoFromFixture(): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cp-acceptance-"));
  tempDirs.push(tempRoot);

  const repoDir = path.join(tempRoot, "repo");
  await fse.copy(FIXTURE_REPO, repoDir);
  await initGitRepo(repoDir);

  return repoDir;
}

export async function cleanupTempDirs(): Promise<void> {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
}

export function createControlPlaneRunner(
  repoDir: string,
): <T>(args: string[]) => Promise<JsonEnvelope<T>> {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  return async function runJson<T>(args: string[]): Promise<JsonEnvelope<T>> {
    logSpy.mockClear();
    await runCli(["node", "mycelium", "cg", ...args, "--json", "--repo", repoDir, "--no-build"]);

    return parseLastJsonLine<JsonEnvelope<T>>(logSpy);
  };
}

export function expectOk<T>(payload: JsonEnvelope<T>): T {
  expect(payload.ok).toBe(true);
  if (payload.ok) {
    return payload.result;
  }
  throw new Error(payload.error.message);
}

export function expectedComponentById(componentId: string): ControlPlaneComponent {
  const match = EXPECTED_COMPONENTS.find((component) => component.id === componentId);
  if (!match) {
    throw new Error(`Missing expected component: ${componentId}`);
  }
  return match;
}

export function edge(
  from_component: string,
  to_component: string,
  kind: ControlPlaneDependencyEdge["kind"],
  confidence: ControlPlaneDependencyEdge["confidence"],
): ControlPlaneDependencyEdge {
  return { from_component, to_component, kind, confidence };
}

async function runCli(argv: string[]): Promise<void> {
  const program = buildCli();
  installExitOverride(program);
  await program.parseAsync(argv);
}

function installExitOverride(command: Command): void {
  command.exitOverride();

  for (const child of command.commands) {
    installExitOverride(child);
  }
}

async function initGitRepo(repoDir: string): Promise<void> {
  await execa("git", ["init"], { cwd: repoDir });
  await execa("git", ["config", "user.email", "cp-acceptance@example.com"], {
    cwd: repoDir,
  });
  await execa("git", ["config", "user.name", "Control Plane Acceptance"], {
    cwd: repoDir,
  });
  await execa("git", ["add", "-A"], { cwd: repoDir });
  await execa("git", ["commit", "-m", "init"], { cwd: repoDir });
}

function parseLastJsonLine<T>(logSpy: ReturnType<typeof vi.spyOn>): T {
  const line = logSpy.mock.calls.map((call: unknown[]) => call.join(" ")).pop() ?? "";
  return JSON.parse(line) as T;
}
