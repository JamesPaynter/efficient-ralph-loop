# 031 — Worker checkpoint commits (reduce lost work)

## Status
- [x] Scoped
- [x] In Progress
- [x] Implemented
- [x] Verified

## Summary
Add a checkpoint strategy so partial progress is not lost across crashes/restarts, and so retries can pick up from committed state.

## Model & Effort
- Effort: **M**
- Tier: **standard**

## Files Changing
- worker/loop.ts — add checkpoint commits and final commit handling.
- worker/index.ts — plumb checkpoint flag into worker config.
- src/core/executor.ts — sync checkpoint commits into run state and pass config to workers.
- worker/loop.test.ts, src/core/executor.test.ts — checkpoint coverage.

## Implementation Checklist
- [x] After each Codex turn (or each N minutes), if there are uncommitted changes, create a WIP checkpoint commit (e.g., `WIP(Task 012): attempt 2 checkpoint`).
- [x] Record checkpoint commit SHA in run state per attempt.
- [x] Ensure the final success commit is still created with the normal convention (FEAT/FIX/etc).
- [x] On retry, worker continues on top of latest commit; do not reset hard unless configured.
- [x] Add config option: `checkpoint_commits: true|false` (default true for long unattended runs).

## Verification
- [ ] Manual: run a task that fails doctor twice; confirm there are checkpoint commits after each attempt.
- [ ] Manual: simulate worker crash mid-attempt; restart and confirm no local changes are lost (because last checkpoint exists).
- [x] npm test
- [x] npm run build

## Dependencies
### Blocks
- 032

### Blocked by
- 014
- 011
- 030
