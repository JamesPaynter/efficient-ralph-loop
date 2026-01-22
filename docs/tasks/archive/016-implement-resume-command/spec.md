# 016 — Implement resume command

## Status
- [x] Scoped
- [x] In Progress
- [x] Implemented
- [x] Verified

## Summary
Resume the latest (or specified) run by reloading state and restarting pending work (Level 1).

## Model & Effort
- Effort: **M**
- Tier: **mini**

## Files Changing
| file | change type | description |
|---|---|---|
| src/cli/resume.ts | modify | Load prior run state and invoke executor with resume semantics. |
| src/core/state-store.ts | modify | Add helper to locate latest run and load by id. |
| src/core/executor.ts | modify | Support resume mode: running->pending; reuse run_id dirs. |
| src/core/logger.ts | modify | Add resume events: run.resume, task.reset. |

## Blast Radius
- Scope: Operational reliability after crashes or restarts.
- Risk level: Medium — incorrect reset logic can cause unintended reruns or skips.
- Rollback: Disable resume; require fresh run id each time.

## Implementation Checklist
- [x] Implement `resume --run-id <id>` and default to latest.
- [x] Load state and reset any running tasks to pending (MVP).
- [x] Re-run executor using existing directories (logs/state/workspaces).
- [x] Log resume actions for traceability.

## Verification
- `npm test`
- `npm run build`

## Dependencies
### Blocks
- None

### Blocked by
- 009
- 015
