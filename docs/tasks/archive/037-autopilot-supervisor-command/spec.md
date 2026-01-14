# 037 — Autopilot supervisor command (LLM-driven operator)

## Status
- [x] Scoped
- [x] In Progress
- [x] Implemented
- [x] Verified

## Summary
Add an optional agentic 'supervisor' mode that interviews the human, writes planning artifacts, runs `plan`, then runs `run`—all via LLM-driven tool calls.

## Model & Effort
- Effort: **L**
- Tier: **pro**

## Files Changing
- [x] Add new CLI command: `autopilot --project <name>`.
- [x] Autopilot should interview the user for goals/constraints (interactive prompts).
- [x] Autopilot should generate/append planning artifacts under `docs/planning/...` (discovery/architecture/implementation).
- [x] Autopilot should call the existing planner to produce tickets (`.tasks/`).
- [x] Autopilot should kick off `run` and stream periodic status updates.
- [x] Keep the deterministic orchestrator as the engine; autopilot is a thin LLM-driven layer on top.
- [x] Persist the autopilot conversation transcript to `docs/planning/sessions/<timestamp>-autopilot.md`.

## Verification
- Manual: run autopilot against a toy repo and confirm it produces implementation-plan.md + tasks + starts execution.
- `npm test`

## Dependencies
### Blocks
- 041

### Blocked by
- 021
- 023
- 015
- 028
