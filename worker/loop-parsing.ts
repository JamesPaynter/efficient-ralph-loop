import fs from "node:fs/promises";

import { toErrorMessage } from "./logging.js";
import type { TaskManifest } from "./loop.js";

// =============================================================================
// TASK INPUTS
// =============================================================================

export async function loadTaskInputs(
  specPath: string,
  manifestPath: string,
): Promise<{
  spec: string;
  manifest: TaskManifest;
}> {
  const [specRaw, manifestRaw] = await Promise.all([
    fs.readFile(specPath, "utf8"),
    fs.readFile(manifestPath, "utf8"),
  ]);

  let manifest: TaskManifest;
  try {
    manifest = JSON.parse(manifestRaw) as TaskManifest;
  } catch (err) {
    throw new Error(`Failed to parse manifest at ${manifestPath}: ${toErrorMessage(err)}`);
  }

  return { spec: specRaw, manifest };
}

// =============================================================================
// MANIFEST NORMALIZATION
// =============================================================================

export function resolveLintCommand(manifest: TaskManifest, fallback?: string): string | undefined {
  const manifestLint = manifest.verify?.lint?.trim() ?? "";
  if (manifestLint.length > 0) return manifestLint;

  const fallbackLint = fallback?.trim() ?? "";
  return fallbackLint.length > 0 ? fallbackLint : undefined;
}

export function normalizeWriteGlobs(globs?: string[]): string[] {
  const normalized = (globs ?? []).map((glob) => glob.trim()).filter((glob) => glob.length > 0);
  return Array.from(new Set(normalized)).sort();
}
