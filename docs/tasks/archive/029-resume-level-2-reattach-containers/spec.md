# 029 — Resume Level 2: reattach to running containers

## Status
- [x] Scoped
- [x] In Progress
- [x] Implemented
- [x] Verified

## Summary
Upgrade resume from 'reset running → pending' to reattaching to already-running containers and continuing log streaming without restarting work.

## Model & Effort
- Effort: **L**
- Tier: **standard**

## Files Changing
...
- [x] Add container labels at create time (project, run_id, task_id, branch, workspace_path).
- [x] Persist container_id per task in run state (if not already).
- [x] On `resume`, scan Docker for containers matching `{project, run_id}` labels.
- [x] For each task with status=running where the container is still running: reattach log streams and keep status=running.
- [x] For each task with status=running where the container has exited: collect exit code, mark complete/failed, and collect final logs.
- [x] For each task with status=running where the container is missing: downgrade to pending (Level 1 fallback).
- [x] Ensure log streaming is restartable/idempotent (duplicates acceptable; missing lines not acceptable).
- [x] Add orchestrator events: `container.reattach`, `container.missing`, `container.exited-on-resume`.

## Verification
- Manual: start `run`, kill orchestrator process mid-batch, then `resume` and confirm it reattaches (no containers restarted).
- Manual: kill a worker container mid-task, then `resume` and confirm the orchestrator marks it pending (or restarts per policy).
- `npm test`
- `npm run build`

## Dependencies
### Blocks
- 030

### Blocked by
- 012
- 016
- 009
- 008
