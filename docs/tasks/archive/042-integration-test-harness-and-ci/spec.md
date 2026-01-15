# 042 — Integration test harness + CI regression runs

## Status
- [x] Scoped
- [x] In Progress
- [x] Implemented
- [x] Verified

## Summary
Add a toy repo harness and CI workflow to continuously validate the orchestrator end-to-end (plan + run + merge) without manual testing.

## Model & Effort
- Effort: **L**
- Tier: **standard**

## Files Changing
- [x] Create a tiny fixture repo under `test/fixtures/toy-repo/` with deterministic `doctor` and minimal dependencies.
- [x] Add an integration test that runs `plan` against a fixed implementation plan (or pre-generated tasks).
- [x] In the integration test, run `run` with `max_parallel=2` and assert integration branch is updated.
- [x] In the integration test, assert integration `doctor` passes after merge.
- [x] In CI, run the integration test in an environment with Docker available.
- [x] Ensure CI does not require real LLM credentials by supporting mock LLM mode for planner/worker in tests.

## Verification
- `npm test` (includes integration suite)
- CI: green run with Docker enabled

## Dependencies
### Blocks
- None

### Blocked by
- 028
- 029
- 039
- 041
