import {
  addRemote,
  abortMerge,
  branchExists,
  checkout,
  checkoutNewBranch,
  deleteLocalBranch,
  ensureCleanWorkingTree,
  fetchRemote,
  git,
  headSha,
  isAncestor,
  isMergeConflictError,
  mergeNoFf,
  removeRemote,
} from "./git.js";

export type TaskBranchToMerge = {
  taskId: string;
  branchName: string;
  workspacePath: string;
};

export type MergeConflict = {
  branch: TaskBranchToMerge;
  message: string;
};

export type MergeResult = {
  status: "merged";
  merged: TaskBranchToMerge[];
  conflicts: MergeConflict[];
  mergeCommit: string;
};

export type TempMergeResult = MergeResult & {
  baseSha: string;
  tempBranch: string;
};

export type FastForwardResult =
  | {
      status: "fast_forwarded";
      previousHead: string;
      head: string;
    }
  | {
      status: "blocked";
      reason: "main_advanced" | "non_fast_forward";
      message: string;
      currentHead: string;
      targetRef: string;
    };

export async function mergeTaskBranches(opts: {
  repoPath: string;
  mainBranch: string;
  branches: TaskBranchToMerge[];
}): Promise<MergeResult> {
  const { repoPath, mainBranch, branches } = opts;

  await ensureCleanWorkingTree(repoPath);
  await checkout(repoPath, mainBranch);

  return mergeTaskBranchesInCurrent(repoPath, branches);
}

export async function mergeTaskBranchesToTemp(opts: {
  repoPath: string;
  mainBranch: string;
  tempBranch: string;
  branches: TaskBranchToMerge[];
}): Promise<TempMergeResult> {
  const { repoPath, mainBranch, tempBranch, branches } = opts;

  await ensureCleanWorkingTree(repoPath);
  await checkout(repoPath, mainBranch);
  const baseSha = await headSha(repoPath);
  const resolvedTempBranch = await resolveTempBranchName(repoPath, tempBranch);

  await checkoutNewBranch(repoPath, resolvedTempBranch, baseSha);

  const mergeResult = await mergeTaskBranchesInCurrent(repoPath, branches);

  return {
    ...mergeResult,
    baseSha,
    tempBranch: resolvedTempBranch,
  };
}

export async function fastForward(opts: {
  repoPath: string;
  mainBranch: string;
  targetRef: string;
  expectedBaseSha?: string;
  cleanupBranch?: string;
}): Promise<FastForwardResult> {
  const { repoPath, mainBranch, targetRef, expectedBaseSha, cleanupBranch } = opts;

  await ensureCleanWorkingTree(repoPath);
  await checkout(repoPath, mainBranch);

  const currentHead = await headSha(repoPath);
  if (expectedBaseSha && currentHead !== expectedBaseSha) {
    return {
      status: "blocked",
      reason: "main_advanced",
      message: `Expected ${mainBranch} at ${expectedBaseSha} but found ${currentHead}.`,
      currentHead,
      targetRef,
    };
  }

  const canFastForward = await isAncestor(repoPath, currentHead, targetRef);
  if (!canFastForward) {
    return {
      status: "blocked",
      reason: "non_fast_forward",
      message: `Cannot fast-forward ${mainBranch} to ${targetRef}.`,
      currentHead,
      targetRef,
    };
  }

  await git(repoPath, ["merge", "--ff-only", targetRef]);
  const nextHead = await headSha(repoPath);

  if (cleanupBranch) {
    await deleteLocalBranch(repoPath, cleanupBranch).catch(() => undefined);
  }

  return { status: "fast_forwarded", previousHead: currentHead, head: nextHead };
}

function buildWorkspaceRemoteName(taskId: string): string {
  const safeId = taskId.replace(/[^A-Za-z0-9_.-]/g, "-") || "task";
  return `task-${safeId}`;
}

async function mergeTaskBranchesInCurrent(
  repoPath: string,
  branches: TaskBranchToMerge[],
): Promise<MergeResult> {
  const merged: TaskBranchToMerge[] = [];
  const conflicts: MergeConflict[] = [];
  let mergeCommit = await headSha(repoPath);

  for (const branch of branches) {
    const remoteName = buildWorkspaceRemoteName(branch.taskId);
    await removeRemote(repoPath, remoteName).catch(() => undefined);

    try {
      await addRemote(repoPath, remoteName, branch.workspacePath);
      await fetchRemote(repoPath, remoteName, branch.branchName);
      await mergeNoFf(repoPath, "FETCH_HEAD", `Merge ${branch.branchName}`);

      mergeCommit = await headSha(repoPath);
      merged.push(branch);
    } catch (err) {
      if (isMergeConflictError(err)) {
        await abortMerge(repoPath).catch(() => undefined);

        conflicts.push({
          branch,
          message: formatMergeError(err),
        });
        continue;
      }

      throw err;
    } finally {
      await removeRemote(repoPath, remoteName).catch(() => undefined);
    }
  }

  return { status: "merged", merged, conflicts, mergeCommit };
}

async function resolveTempBranchName(repoPath: string, desiredName: string): Promise<string> {
  let candidate = desiredName;
  let counter = 1;

  while (await branchExists(repoPath, candidate)) {
    candidate = `${desiredName}-${counter}`;
    counter += 1;
  }

  return candidate;
}

function formatMergeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
