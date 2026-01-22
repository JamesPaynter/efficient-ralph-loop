// Control plane git helpers.
// Purpose: resolve base SHAs for model builds and lookups.
// Assumes the target repo is a valid git checkout.

import { git } from "../git/git.js";

export async function resolveBaseSha(input: {
  repoRoot: string;
  baseSha?: string | null;
  ref?: string | null;
}): Promise<string> {
  const baseSha = input.baseSha?.trim() ?? null;
  const ref = input.ref?.trim() ?? null;
  const target = baseSha || ref || "HEAD";

  const result = await git(input.repoRoot, ["rev-parse", target]);
  return result.stdout.trim();
}
