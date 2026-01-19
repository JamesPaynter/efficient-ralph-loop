import path from "node:path";

import type { VersioningConfig } from "./config.js";

export type MyceliumGitignoreOptions = {
  repoPath: string;
  tasksDir: string;
  planningDir: string;
  versioning: VersioningConfig;
};

export function buildMyceliumGitignore(options: MyceliumGitignoreOptions): string {
  const entries = buildIgnoreEntries(options);
  const lines = [
    "# Managed by Mycelium. Edit .mycelium/config.yaml versioning to change tracked paths.",
    ...entries,
    "",
  ];
  return lines.join("\n");
}

function buildIgnoreEntries(options: MyceliumGitignoreOptions): string[] {
  const myceliumRoot = path.join(options.repoPath, ".mycelium");
  const entries: string[] = [
    "logs/",
    "state/",
    "workspaces/",
    "codex/",
    "projects/",
  ];

  if (!options.versioning.commit_tasks) {
    const entry = relativeToMycelium(myceliumRoot, path.resolve(options.repoPath, options.tasksDir));
    if (entry) entries.push(ensureTrailingSlash(entry));
  }

  if (!options.versioning.commit_planning) {
    const entry = relativeToMycelium(
      myceliumRoot,
      path.resolve(options.repoPath, options.planningDir),
    );
    if (entry) entries.push(ensureTrailingSlash(entry));
  }

  return Array.from(new Set(entries)).sort();
}

function relativeToMycelium(myceliumRoot: string, targetAbs: string): string | null {
  const rel = path.relative(myceliumRoot, targetAbs);
  if (!rel || rel === "." || rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return rel.split(path.sep).join("/");
}

function ensureTrailingSlash(entry: string): string {
  return entry.endsWith("/") ? entry : `${entry}/`;
}
