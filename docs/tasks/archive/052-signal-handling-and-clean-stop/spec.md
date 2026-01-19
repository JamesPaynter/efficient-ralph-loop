# 052 — Graceful stop semantics (SIGINT/SIGTERM) and reliable resume

## Status
- [x] Ready
- [x] In progress
- [ ] In review
- [x] Done

## Summary
Make “stop the orchestrator” a first-class, predictable operation so that long unattended runs can be interrupted safely and resumed cleanly.

## Scope
- Add SIGINT/SIGTERM handling in the CLI run/autopilot paths so that:
  - the orchestrator logs a clear `run.stop` event with reason
  - state is flushed to disk
  - running containers are either:
    - left running intentionally (preferred, to allow reattach), or
    - stopped based on an explicit flag (e.g., `--stop-containers-on-exit`)
- Document the intended behavior in README and ops docs.

## Out of scope
- Building a full “pause/resume scheduler” with new state machine states.
- Remote job control / UI.

## Acceptance criteria
- User can press Ctrl+C during a run and see a clear message explaining:
  - what happened to containers
  - how to resume
- After Ctrl+C, `mycelium resume` continues without requiring manual state edits.

## Likely files / areas to change
- src/cli/run.ts
- src/cli/autopilot.ts
- src/core/executor.ts (if required for coordinated shutdown)
- README.md / docs/ops/*

## Implementation notes
- Keep orchestrator deterministic: signal handler should trigger a deterministic shutdown path.
- Avoid partial writes by ensuring state-store writes are atomic (verify current behavior).

## Verification
- Manual: run a fixture project, Ctrl+C mid-task, then `resume` and confirm completion.
- Automated: added `src/core/graceful-stop.test.ts` covering stop signal logging and resume.
