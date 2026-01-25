# Orchestrator module

Application-layer orchestration boundary for running tasks. This module introduces explicit
ports and a run-scoped context so the legacy executor can be strangled into smaller units.

## Layering and dependency direction
- `src/app/orchestrator` depends on `src/core` and external adapters; keep CLI/UI out.
- `src/core/executor.ts` currently calls `run-engine.ts` as a temporary adapter while the legacy flow is strangled.
- `run-engine.ts` should only use `RunContext` + ports; avoid reaching into globals.
- `run-context.ts` is the composition root that wires default adapters to the ports.

## Adding a new orchestration capability
1) Add or extend a port in `ports.ts` to describe the needed dependency.
2) Implement the adapter in `run-context.ts` (or inject a test double).
3) Add orchestration logic in `run-engine.ts` or a new module in this folder.
