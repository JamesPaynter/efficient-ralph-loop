/**
 * Git-backed VCS adapter.
 * Purpose: map Vcs interface calls to existing git helpers.
 * Assumptions: git is available and repo paths are local.
 * Usage: createGitVcs({ taskBranchPrefix }) and inject into RunContext ports.
 */

import { buildTaskBranchName } from "../../../git/branches.js";
import { listChangedFiles } from "../../../git/changes.js";
import {
  checkout,
  checkoutOrCreateBranch,
  ensureCleanWorkingTree,
  headSha,
  isAncestor,
  resolveRunBaseSha,
} from "../../../git/git.js";
import { fastForward, mergeTaskBranches, mergeTaskBranchesToTemp } from "../../../git/merge.js";

import type { Vcs } from "./vcs.js";

// =============================================================================
// TYPES
// =============================================================================

export type GitVcsOptions = {
  taskBranchPrefix: string;
};

// =============================================================================
// PUBLIC API
// =============================================================================

export function createGitVcs(options: GitVcsOptions): Vcs {
  const { taskBranchPrefix } = options;

  return {
    ensureCleanWorkingTree,
    checkout,
    checkoutOrCreateBranch,
    resolveRunBaseSha,
    headSha,
    isAncestor,
    mergeTaskBranches,
    mergeTaskBranchesToTemp,
    fastForward,
    buildTaskBranchName: (taskId, taskName) =>
      buildTaskBranchName(taskBranchPrefix, taskId, taskName),
    listChangedFiles,
  };
}
