# 026 — Add doctor validator agent (non-blocking)

## Status
- [x] Scoped
- [x] In Progress
- [x] Implemented
- [x] Verified

## Summary
Assess doctor command effectiveness periodically and emit recommendations (non-blocking).

## Model & Effort
- Effort: **M**
- Tier: **pro**

## Files Changing
| file | change type | description |
|---|---|---|
| src/validators/doctor-validator.ts | add | LLM agent that evaluates doctor command coverage and gaps. |
| src/core/executor.ts | modify | Invoke every N tasks or on suspicious patterns when enabled. |
| src/core/config.ts | modify | Add doctor_validator enabled/run_every_n_tasks options. |
| templates/prompts/doctor-validator.md | modify | Ensure prompt matches desired JSON schema. |

## Blast Radius
- Scope: Operational confidence; impacts cost and runtime but not merging when advisory.
- Risk level: Medium — may be noisy; keep it advisory with clear confidence.
- Rollback: Disable via config.

## Implementation Checklist
- [x] Implement configurable trigger (every N tasks).
- [x] Collect doctor outputs and recent diffs as context.
- [x] Call LLM in deterministic mode; emit events and recommendations.

## Verification
- `npm test`
- `npm run build`
- `Manual: run with fixtures and confirm report generation (not run; covered by automated fixtures/tests).`

## Dependencies
### Blocks
- None

### Blocked by
- 021
- 022
- 015
