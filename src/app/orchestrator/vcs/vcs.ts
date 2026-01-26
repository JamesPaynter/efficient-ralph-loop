/**
 * VCS adapter interface for orchestrator runs.
 * Purpose: provide a minimal surface for branch, merge, and diff operations.
 * Assumptions: implementations operate on a local working copy.
 * Usage: inject into RunContext ports and call from executor helpers.
 */

import type {
  FastForwardResult,
  MergeResult,
  TaskBranchToMerge,
  TempMergeResult,
} from "../../../git/merge.js";

// =============================================================================
// TYPES
// =============================================================================

export interface Vcs {
  ensureCleanWorkingTree(repoPath: string): Promise<void>;
  checkout(repoPath: string, branch: string): Promise<void>;
  checkoutOrCreateBranch(repoPath: string, branch: string): Promise<void>;
  resolveRunBaseSha(repoPath: string, mainBranch: string): Promise<string>;
  headSha(repoPath: string): Promise<string>;
  isAncestor(repoPath: string, ancestorSha: string, descendantSha: string): Promise<boolean>;
  mergeTaskBranches(options: {
    repoPath: string;
    mainBranch: string;
    branches: TaskBranchToMerge[];
  }): Promise<MergeResult>;
  mergeTaskBranchesToTemp(options: {
    repoPath: string;
    mainBranch: string;
    tempBranch: string;
    branches: TaskBranchToMerge[];
  }): Promise<TempMergeResult>;
  fastForward(options: {
    repoPath: string;
    mainBranch: string;
    targetRef: string;
    expectedBaseSha?: string;
    cleanupBranch?: string;
  }): Promise<FastForwardResult>;
  buildTaskBranchName(taskId: string, taskName: string): string;
  listChangedFiles(cwd: string, baseRef: string): Promise<string[]>;
}
