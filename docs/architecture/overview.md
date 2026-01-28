# Architecture overview

## Purpose
- Make module boundaries and dependency direction explicit.
- Explain how the orchestrator wires adapters through ports and a run context.
- Point to ADRs that lock in key decisions.

## Module map
- `src/app/`: application use-cases and orchestration (run context, run engine, config resolution); depends on `src/core` plus adapter modules.
- `src/core/`: shared logic and state (config, scheduler, manifests, logs, paths); framework-agnostic and CLI/UI-free.
- `src/cli/`: CLI adapter and command wiring; depends on `src/app` and `src/core`.
- `src/ui/`: HTTP/UI adapter and static assets; depends on `src/app` and `src/core`.
- `src/validators/`: outbound adapters for test/style/doctor/architecture validators; invoked via orchestrator ports.
- `src/control-plane/`: control graph, policy, and blast-radius tooling; used by app/orchestrator.
- `src/docker/`: Docker worker adapter; used by app/orchestrator.
- `src/git/`: VCS adapter for task branches and repo operations.
- `src/llm/`: LLM client adapters for planner/worker flows.
- `worker/`: task execution loop used by the orchestrator (local or Docker workers).

## Dependency direction
```
src/cli      src/ui
   \          /
    \        /
     src/app (orchestrator, run context)
        | \
        |  -> outbound adapters (validators, docker, git, llm, control-plane, worker)
        |
     src/core (shared logic)
```

- `src/core` must not import `src/cli` or `src/ui`.
- `src/ui` must not import `src/cli`.
- `src/app` can import `src/core` and outbound adapters; entrypoints call into `src/app`.
- Temporary exception: `src/core/executor.ts` imports `src/app/orchestrator` to bridge the legacy run engine; keep this isolated.

## Boundary enforcement
- ESLint `import/no-restricted-paths` rules in `.eslintrc.cjs` enforce core/CLI/UI boundaries.
- Add new zones when introducing a new layer or adapter family.
- Run `npm run lint` before merge to catch boundary regressions.

## Key ADRs
- [0001 - Layering and boundaries](adr/0001-layering-and-boundaries.md)
- [0002 - Orchestrator ports and run context](adr/0002-orchestrator-ports-and-run-context.md)
- [0003 - No process.env in core](adr/0003-no-process-env-in-core.md)
