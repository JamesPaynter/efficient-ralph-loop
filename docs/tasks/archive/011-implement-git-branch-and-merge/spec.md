# 011 — Implement git branch and merge

## Status
- [x] Scoped
- [x] In Progress
- [x] Implemented
- [x] Verified

## Summary
Add deterministic branch creation, fetch-from-workspace, and merge-to-integration workflows.

## Model & Effort
- Effort: **M**
- Tier: **mini**

## Files Changing
| file | change type | description |
|---|---|---|
| src/git/branches.ts | add | Create task branches and compute branch names. |
| src/git/merge.ts | add | Merge task branches sequentially into main_branch. |
| src/git/git.ts | modify | Add helpers for fetch, merge, and conflict detection. |
| src/git/merge.test.ts | add | Unit tests with small repos for merge success/failure. |

## Blast Radius
- Scope: Integration correctness and final code state.
- Risk level: High — merge mistakes can corrupt integration branch or lose changes.
- Rollback: Abort merge and reset integration branch to pre-merge commit; preserve task branches.

## Implementation Checklist
- [x] Implement branch naming: <prefix><id>-<kebab-name> (e.g., agent/001-foo).
- [x] Create branch from main_branch inside each workspace clone.
- [x] After task completion, fetch branch from workspace into main repo and merge into main_branch.
- [x] On merge conflict: stop batch merge, log error, and mark run failed or requires intervention.
- [x] Add tests for happy path merge and conflict case.

## Verification
- `npm test`
- `npm run build`

## Dependencies
### Blocks
- 014
- 015

### Blocked by
- 010
