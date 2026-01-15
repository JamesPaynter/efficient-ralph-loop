# 2026-01-11

## Notes

# 2026-01-15

## Notes
- Built mock LLM path (planner + worker) so tests do not need API keys.
- Added toy fixture repo under `test/fixtures/toy-repo` with mock doctor expectations.
- Wrote integration test to run `plan` + `run` (`max_parallel=2`, `useDocker=false`) and assert merges/doctor success.
- CI workflow added to run build + tests with Docker available.

## Commands
- `npm run build`
- `npm test`
