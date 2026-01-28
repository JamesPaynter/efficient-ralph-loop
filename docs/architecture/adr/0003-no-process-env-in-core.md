# ADR 0003: No process.env in core

## Status
Accepted — 2026-01-28

## Context
- Core modules should stay deterministic and easy to test.
- Reading `process.env` directly ties core logic to a single runtime environment.
- The app layer already centralizes configuration and path resolution.

## Decision
- Core modules must not read `process.env` directly.
- Environment-derived values flow through the app/CLI layer and ports (for example, `AppPathsInput.env`).
- Orchestrator run context should carry any env-derived settings needed by adapters.
- Existing exceptions are legacy debt and should be reduced over time, not expanded:
  - `src/core/config-loader.ts`
  - `src/core/codexAuth.ts`
  - `src/core/planner-codex-client.ts`
  - `src/core/workspaces.ts`

## Consequences
- Core stays portable and testable across environments.
- Some refactors are required to move env lookups outward.
- New core code must use explicit parameters or ports instead of `process.env`.
