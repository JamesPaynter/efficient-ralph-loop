# ADR 0001: Layering and boundaries

## Status
Accepted — 2026-01-28

## Context
- The repo has multiple entrypoints (CLI, UI, workers) with overlapping concerns.
- Cross-imports make it hard to reason about dependencies and slow refactors.
- ESLint can enforce restricted import zones once boundaries are explicit.

## Decision
- Use a layered architecture:
  - `src/core` is framework-agnostic shared logic and state.
  - `src/app` is the use-case layer (orchestrator, context builders).
  - `src/cli` and `src/ui` are entrypoint adapters.
  - Outbound adapters live in `src/validators`, `src/docker`, `src/git`, `src/llm`, `src/control-plane`, and `worker/`.
- Dependency direction is: entrypoints -> `src/app` -> `src/core`, with `src/app` calling outbound adapters.
- Enforce boundaries with ESLint `import/no-restricted-paths` in `.eslintrc.cjs`.
- Allow a single, explicit exception: `src/core/executor.ts` bridges to `src/app/orchestrator` while the legacy run engine is strangled.

## Consequences
- Architecture reviews focus on clear layer edges instead of file-by-file rules.
- Lint catches accidental layer violations before merge.
- The executor bridge is the only sanctioned inversion and should be retired over time.
