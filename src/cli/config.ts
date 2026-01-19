import path from "node:path";

import type { ProjectConfig } from "../core/config.js";
import { loadProjectConfig } from "../core/config-loader.js";
import { findRepoRoot, resolveProjectConfigPath } from "../core/config-discovery.js";

export function loadConfigForCli(args: {
  projectName?: string;
  explicitConfigPath?: string;
  initIfMissing?: boolean;
  cwd?: string;
}): {
  config: ProjectConfig;
  configPath: string;
  created: boolean;
  projectName: string;
} {
  const cwd = args.cwd ?? process.cwd();
  let projectName = args.projectName;

  if (!projectName) {
    const repoRoot = findRepoRoot(cwd);
    if (repoRoot) {
      projectName = path.basename(repoRoot);
    } else if (args.explicitConfigPath) {
      const configDir = path.dirname(path.resolve(args.explicitConfigPath));
      const configRepo = findRepoRoot(configDir);
      if (configRepo) {
        projectName = path.basename(configRepo);
      }
    }
  }

  if (!projectName) {
    throw new Error(
      "Project name is required when no git repo is available. Pass --project or run inside a git repo.",
    );
  }

  const resolved = resolveProjectConfigPath({
    projectName,
    explicitPath: args.explicitConfigPath,
    cwd,
    initIfMissing: args.initIfMissing,
  });

  const config = loadProjectConfig(resolved.configPath);
  if (!process.env.MYCELIUM_HOME) {
    process.env.MYCELIUM_HOME = path.join(config.repo_path, ".mycelium");
  }
  return { config, configPath: resolved.configPath, created: resolved.created, projectName };
}
