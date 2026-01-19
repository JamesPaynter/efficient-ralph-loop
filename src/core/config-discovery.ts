import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildMyceliumGitignore } from "./mycelium-gitignore.js";
import { projectConfigPath } from "./paths.js";

const REPO_CONFIG_DIR = ".mycelium";
const REPO_CONFIG_FILE = "config.yaml";
const DEFAULT_TASKS_DIR = `${REPO_CONFIG_DIR}/tasks`;
const DEFAULT_PLANNING_DIR = `${REPO_CONFIG_DIR}/planning`;
const DEFAULT_DOCTOR_SCRIPT = `${REPO_CONFIG_DIR}/doctor.sh`;
const DEFAULT_VERSIONING = { commit_planning: true, commit_tasks: true };

export type ConfigSource = "explicit" | "repo" | "home";

export type ConfigResolution = {
  configPath: string;
  source: ConfigSource;
  created: boolean;
};

export type InitResult = {
  repoRoot: string;
  configPath: string;
  status: "created" | "exists" | "overwritten";
};

export function resolveProjectConfigPath(args: {
  projectName: string;
  explicitPath?: string;
  cwd?: string;
  initIfMissing?: boolean;
}): ConfigResolution {
  const cwd = args.cwd ?? process.cwd();

  if (args.explicitPath) {
    return {
      configPath: path.resolve(args.explicitPath),
      source: "explicit",
      created: false,
    };
  }

  const repoRoot = findRepoRoot(cwd);
  if (repoRoot) {
    const repoConfig = repoConfigPath(repoRoot);

    if (fs.existsSync(repoConfig)) {
      return { configPath: repoConfig, source: "repo", created: false };
    }

    if (args.initIfMissing ?? true) {
      ensureRepoConfig(repoRoot, repoConfig, { force: false });
      return { configPath: repoConfig, source: "repo", created: true };
    }

    return { configPath: repoConfig, source: "repo", created: false };
  }

  return {
    configPath: projectConfigPath(args.projectName),
    source: "home",
    created: false,
  };
}

export function initRepoConfig(args: { cwd?: string; force?: boolean }): InitResult {
  const cwd = args.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) {
    throw new Error("No git repository found in the current or parent directories.");
  }

  const repoConfig = repoConfigPath(repoRoot);
  const hasConfig = fs.existsSync(repoConfig);

  const configDir = path.dirname(repoConfig);
  ensureRepoLayout(repoRoot, configDir);

  if (hasConfig && !(args.force ?? false)) {
    return { repoRoot, configPath: repoConfig, status: "exists" };
  }

  ensureRepoConfig(repoRoot, repoConfig, { force: args.force ?? false });
  const status = hasConfig && (args.force ?? false) ? "overwritten" : "created";
  return { repoRoot, configPath: repoConfig, status };
}

export function findRepoRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function repoConfigPath(repoRoot: string): string {
  return path.join(repoRoot, REPO_CONFIG_DIR, REPO_CONFIG_FILE);
}

function ensureRepoLayout(repoRoot: string, configDir: string): void {
  fs.mkdirSync(configDir, { recursive: true });
  ensureTasksDir(configDir);
  ensurePlanningDir(configDir);
  ensureLocalGitignore(repoRoot, configDir);
  ensureDoctorScript(path.join(repoRoot, DEFAULT_DOCTOR_SCRIPT));
}

function ensureRepoConfig(
  repoRoot: string,
  configPath: string,
  opts: { force: boolean },
): void {
  if (fs.existsSync(configPath) && !opts.force) return;

  const configDir = path.dirname(configPath);
  ensureRepoLayout(repoRoot, configDir);

  const orchestratorRoot = findOrchestratorRoot();
  const dockerfile = orchestratorRoot
    ? path.join(orchestratorRoot, "templates", "Dockerfile")
    : "CHANGE_ME";
  const buildContext = orchestratorRoot ? orchestratorRoot : "CHANGE_ME";

  const config = buildDefaultConfig({
    dockerfile,
    buildContext,
  });

  fs.writeFileSync(configPath, config, "utf8");
}

function ensureTasksDir(configDir: string): void {
  fs.mkdirSync(path.join(configDir, "tasks"), { recursive: true });
}

function ensurePlanningDir(configDir: string): void {
  fs.mkdirSync(path.join(configDir, "planning"), { recursive: true });
}

function ensureLocalGitignore(repoRoot: string, configDir: string): void {
  const ignorePath = path.join(configDir, ".gitignore");
  const content = buildMyceliumGitignore({
    repoPath: repoRoot,
    tasksDir: DEFAULT_TASKS_DIR,
    planningDir: DEFAULT_PLANNING_DIR,
    versioning: DEFAULT_VERSIONING,
  });
  const current = fs.existsSync(ignorePath) ? fs.readFileSync(ignorePath, "utf8") : null;
  if (current !== content) {
    fs.writeFileSync(ignorePath, content, "utf8");
  }
}

function ensureDoctorScript(scriptPath: string): void {
  if (fs.existsSync(scriptPath)) return;

  const content = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'if [[ "${ORCH_CANARY:-}" == "1" ]]; then',
    '  echo "ORCH_CANARY=1: failing as expected"',
    "  exit 1",
    "fi",
    "",
    'echo "Doctor not configured. Update .mycelium/doctor.sh"',
    "exit 0",
    "",
  ].join("\n");

  fs.writeFileSync(scriptPath, content, "utf8");
  try {
    fs.chmodSync(scriptPath, 0o755);
  } catch {
    // Ignore chmod failures (e.g., on Windows).
  }
}

function buildDefaultConfig(args: { dockerfile: string; buildContext: string }): string {
  return [
    "# Auto-generated Mycelium config. Update as needed.",
    "repo_path: ..",
    `tasks_dir: ${DEFAULT_TASKS_DIR}`,
    `planning_dir: ${DEFAULT_PLANNING_DIR}`,
    "versioning:",
    "  commit_planning: true",
    "  commit_tasks: true",
    "main_branch: main",
    "",
    `doctor: ./${DEFAULT_DOCTOR_SCRIPT}`,
    "doctor_timeout: 900",
    "",
    "resources:",
    "  - name: repo",
    "    description: Entire repo",
    '    paths: ["**/*"]',
    "",
    "planner:",
    "  provider: openai",
    "  model: gpt-5.2",
    "  reasoning_effort: xhigh",
    "",
    "worker:",
    "  model: gpt-5.2-codex",
    "  reasoning_effort: xhigh",
    "  checkpoint_commits: true",
    "",
    "docker:",
    `  image: mycelium-worker:latest`,
    `  dockerfile: ${yamlString(args.dockerfile)}`,
    `  build_context: ${yamlString(args.buildContext)}`,
    "",
  ].join("\n");
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function findOrchestratorRoot(): string | null {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return findUp(moduleDir, (dir) => fs.existsSync(path.join(dir, "templates", "Dockerfile")));
}

function findUp(start: string, predicate: (dir: string) => boolean): string | null {
  let current = path.resolve(start);
  while (true) {
    if (predicate(current)) return current;

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
