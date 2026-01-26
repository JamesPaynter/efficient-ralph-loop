// Control plane change manifest integration.
// Purpose: summarize real git diffs into touched/impacted components and surface changes.
// Assumes changed files are repo-relative paths.

import path from "node:path";

import type { TaskManifest } from "../../core/task-manifest.js";
import { computeBlastRadius as computeBlastRadiusFromPaths } from "../blast.js";
import type { ControlPlaneModel } from "../model/schema.js";
import { detectSurfaceChanges, resolveSurfacePatterns } from "../policy/surface-detect.js";
import type { SurfaceChangeDetection, SurfacePatternSet } from "../policy/types.js";

// =============================================================================
// TYPES
// =============================================================================

export type TaskChangeManifest = {
  task_id: string;
  task_name: string;
  base_sha: string;
  head_sha: string;
  changed_files: string[];
  touched_components: string[];
  impacted_components: string[];
  surface_change: SurfaceChangeDetection;
  notes: string[];
};

export type TaskChangeManifestInput = {
  task: TaskManifest;
  baseSha: string;
  headSha: string;
  changedFiles: string[];
  model?: ControlPlaneModel | null;
  surfacePatterns?: SurfacePatternSet;
};

// =============================================================================
// PUBLIC API
// =============================================================================

export function buildTaskChangeManifest(input: TaskChangeManifestInput): TaskChangeManifest {
  const surfacePatterns = input.surfacePatterns ?? resolveSurfacePatterns();
  const notes: string[] = [];

  let normalizedFiles = normalizeChangedFiles(input.changedFiles);
  let touchedComponents: string[] = [];
  let impactedComponents: string[] = [];

  if (input.model) {
    const blast = computeBlastRadiusFromPaths({
      changedPaths: normalizedFiles,
      model: input.model,
    });

    normalizedFiles = blast.changed_paths;
    touchedComponents = blast.touched_components;
    impactedComponents = blast.impacted_components;

    if (normalizedFiles.length > 0 && touchedComponents.length === 0) {
      notes.push("No component owners resolved for changed files.");
    }
  } else if (normalizedFiles.length > 0) {
    notes.push("Control plane model unavailable; touched components not derived.");
  }

  const surfaceChange = detectSurfaceChanges(normalizedFiles, surfacePatterns);

  return {
    task_id: input.task.id,
    task_name: input.task.name,
    base_sha: input.baseSha,
    head_sha: input.headSha,
    changed_files: normalizedFiles,
    touched_components: touchedComponents,
    impacted_components: impactedComponents,
    surface_change: surfaceChange,
    notes,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function normalizeChangedFiles(changedFiles: string[]): string[] {
  const normalized = new Set<string>();

  for (const changedFile of changedFiles) {
    const trimmed = changedFile.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const normalizedPath = normalizeRepoPath(trimmed);
    if (normalizedPath.length > 0) {
      normalized.add(normalizedPath);
    }
  }

  return Array.from(normalized).sort();
}

function normalizeRepoPath(inputPath: string): string {
  const normalized = inputPath.split(path.sep).join("/");
  const withoutDot = normalized.replace(/^\.\/+/, "");
  const withoutLeading = withoutDot.replace(/^\/+/, "");
  return withoutLeading.replace(/\/+$/, "");
}
