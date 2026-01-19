# Scratchpad — 054 — Spec traceability matrix and acceptance checklist

## 2026-01-19
- Notes:
  - Added `docs/spec-traceability.md` with requirement → code → tests/manual drill links.
  - Deprecated the old compliance checklist in favor of the matrix and linked it from README.
  - Moved the task to `docs/tasks/archive/054-...`.
- Commands:
  - `npm test` (pass; Docker-gated suites skipped without `RUN_DOCKER_TESTS`)
  - `npm run build` (pass)
- Decisions:
  - Keep manual drill reference only for resumability (resume drill); other principles covered by automated tests.
