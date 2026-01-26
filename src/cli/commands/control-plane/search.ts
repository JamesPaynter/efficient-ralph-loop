import path from "node:path";

import { Command } from "commander";
import { execa } from "execa";

import type { ControlPlaneCommandContext } from "./index.js";

const DEFAULT_MAX_RESULTS = 200;

type SearchOptions = {
  max?: number;
  glob?: string[];
};

// =============================================================================
// COMMAND REGISTRATION
// =============================================================================

export function registerSearchCommand(
  controlPlane: Command,
  ctx: ControlPlaneCommandContext,
): void {
  controlPlane
    .command("search")
    .description("Fast repo search using git grep")
    .argument("<query>", "Search query")
    .option(
      "--max <n>",
      `Max results (default: ${DEFAULT_MAX_RESULTS})`,
      (value) => parseInt(value, 10),
      DEFAULT_MAX_RESULTS,
    )
    .option("--glob <pattern>", "Limit search to matching paths (repeatable)", collectGlobs, [])
    .action(async (query, opts, command) => {
      await handleSearch(ctx, String(query), opts as SearchOptions, command);
    });
}

// =============================================================================
// COMMANDS
// =============================================================================

async function handleSearch(
  ctx: ControlPlaneCommandContext,
  query: string,
  opts: SearchOptions,
  command: Command,
): Promise<void> {
  const { flags } = ctx.resolveCommandContext(command);
  const repoRoot = path.resolve(flags.repoPath);
  const maxResults = normalizeMaxResults(opts.max);
  const globs = normalizeGlobs(opts.glob);

  try {
    const args = ["grep", "-n", "--color=never", "-e", query];
    if (globs.length > 0) {
      args.push("--", ...globs);
    }

    const result = await execa("git", args, {
      cwd: repoRoot,
      stdio: "pipe",
      reject: false,
    });

    if (result.exitCode && result.exitCode > 1) {
      const stderr =
        typeof result.stderr === "string" ? result.stderr : String(result.stderr ?? "");
      throw new Error(stderr.trim().length > 0 ? stderr.trim() : "git grep failed");
    }

    const stdout = typeof result.stdout === "string" ? result.stdout : String(result.stdout ?? "");
    const matches = stdout
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    const limited = matches.slice(0, maxResults);
    if (limited.length === 0) {
      return;
    }

    process.stdout.write(`${limited.join("\n")}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function collectGlobs(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function normalizeGlobs(globs: string[] | undefined): string[] {
  if (!globs) {
    return [];
  }

  return globs.map((glob) => glob.trim()).filter(Boolean);
}

function normalizeMaxResults(value: number | undefined): number {
  if (!value || Number.isNaN(value) || value <= 0) {
    return DEFAULT_MAX_RESULTS;
  }

  return Math.floor(value);
}
