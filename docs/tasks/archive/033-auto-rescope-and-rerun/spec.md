# 033 — Auto-rescope tickets when access expands

## Status
- [x] Scoped
- [x] In Progress
- [x] Implemented
- [x] Verified

## Summary
When a task requests access beyond its declared locks/files, automatically update the manifest/spec (or regenerate via planner) and re-run safely.

## Model & Effort
- Effort: **L**
- Tier: **pro**

## Files Changing
...
- [x] When manifest enforcement finds undeclared resources/files, create a new task status: `rescope_required`.
- [x] Implement a rescope workflow:
- [x]   - Option A (fast): automatically expand manifest locks to include newly inferred resources; append new files to `files.reads/writes`.
- [ ]   - Option B (better): call the Planner with the original spec + diff + access requests, and regenerate a refined manifest/spec.
- [x] Persist rescope actions in logs: `task.rescope.start`, `task.rescope.updated`, `task.rescope.failed`.
- [x] After rescope, reset the task branch appropriately (new branch or reuse) and rerun task scheduling.
- [x] Ensure scheduler sees updated locks so parallel batches remain safe.

## Verification
- Manual: run a task that touches an undeclared resource; confirm orchestrator automatically rescopes and reruns to completion without manual edits.
- `npm test`

## Dependencies
### Blocks
- 036

### Blocked by
- 032
- 023
- 009
