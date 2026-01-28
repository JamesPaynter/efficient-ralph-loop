# ADR 0002: Orchestrator ports and run context

## Status
Accepted — 2026-01-28

## Context
- The run engine depends on workspace, VCS, worker, validator, and logging services.
- Direct imports and global singletons make the run engine hard to test and evolve.
- We need a run-scoped composition root that captures resolved config and derived values.

## Decision
- Define explicit ports in `src/app/orchestrator/ports.ts` for all external dependencies.
- Centralize adapter wiring in `src/app/orchestrator/run-context.ts`.
- Build run-scoped configuration with `src/app/orchestrator/run-context-builder.ts`.
- `run-engine.ts` consumes only `RunContext` plus ports and avoids direct global access.
- `src/core/executor.ts` adapts legacy entrypoints by building a `RunContext` and invoking the new run engine.

## Consequences
- Dependencies are explicit and easy to stub in tests.
- Adapter wiring stays in one place instead of spread across the run engine.
- New dependencies require extending ports and context wiring, which keeps changes visible.
