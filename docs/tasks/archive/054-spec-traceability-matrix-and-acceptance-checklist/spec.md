# 054 — Spec traceability matrix and acceptance checklist

## Status
- [x] Ready
- [x] In progress
- [ ] In review
- [x] Done

## Summary
Convert the initial planning spec into a living traceability matrix that links:
spec requirement → code area → test(s) → operational drill (if any).
This is the fastest way to reach “110% confidence” without guesswork.

## Scope
- Create a `docs/spec-traceability.md` that maps the core spec principles:
  - Complete isolation
  - Safe parallelism
  - Total resumability
  - Structured logging
  - Validation gating
  - Planning → tasks → execution pipeline
  to:
  - code modules (files)
  - existing tests
  - missing tests or manual drills
- Update `planning-docs/spec-compliance-checklist.md` to point at the matrix (or deprecate it in favor of the matrix).

## Out of scope
- Writing every missing test in this task (this is the mapping + checklist).

## Acceptance criteria
- There is a single document that answers:
  “If this breaks, what test catches it?”
- Any “not covered by tests” items are explicitly listed with a manual drill reference.

## Likely files / areas to change
- docs/spec-traceability.md (new)
- planning-docs/spec-compliance-checklist.md
- README.md (optional: link to the matrix)

## Implementation notes
- Keep it brutally pragmatic: list the exact test file name and what it asserts.
- Where only a manual drill exists, link to an ops doc and list the expected log event signatures.

## Verification
- Reviewer can pick any major requirement and find:
  requirement → code → test/drill in under 30 seconds.
