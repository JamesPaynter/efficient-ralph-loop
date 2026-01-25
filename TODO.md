
# TODO

## Repo De-Spaghetti Refactor Plan (ticket pack)

Highest-impact first: stop new spaghetti, then break up `src/core/executor.ts`, then enforce boundaries and dedupe.

### Phase 0 — Guardrails (stop new spaghetti)
- [ ] [300 - CI quality gates (typecheck + lint + format:check)](.mycelium/tasks/backlog/300-ci-quality-gates/spec.md) (Effort <S>, Tier <standard>)
- [ ] [301 - Add ESLint spaghetti budgets (max-lines, complexity, max-depth) with scoped exemptions](.mycelium/tasks/backlog/301-spaghetti-budgets-eslint/spec.md) (Effort <M>, Tier <standard>)
- [ ] [302 - Enforce architectural boundaries via ESLint restricted imports](.mycelium/tasks/backlog/302-boundaries-enforced-by-lint/spec.md) (Effort <M>, Tier <standard>)

### Phase 1 — Orchestrator strangler (cut the god-file)
- [ ] [310 - Create orchestrator module skeleton (ports + RunContext + composition root)](.mycelium/tasks/backlog/310-orchestrator-skeleton/spec.md) (Effort <L>, Tier <pro>)
- [ ] [311 - Strangler step 1: extract pure helpers from executor.ts](.mycelium/tasks/backlog/311-executor-extract-pure-helpers/spec.md) (Effort <M>, Tier <standard>)
- [ ] [312 - Strangler step 2: introduce RunContext builder and collapse executor locals](.mycelium/tasks/backlog/312-executor-run-context/spec.md) (Effort <L>, Tier <pro>)
- [ ] [313 - Strangler step 3: unify worker execution behind WorkerRunner (Docker + local)](.mycelium/tasks/backlog/313-worker-runner-abstraction/spec.md) (Effort <L>, Tier <pro>)
- [ ] [314 - Strangler step 4: extract Git operations behind a Vcs adapter](.mycelium/tasks/backlog/314-vcs-adapter-extraction/spec.md) (Effort <M>, Tier <standard>)
- [ ] [315 - Strangler step 5: introduce ValidationPipeline (test/style/architecture/doctor) with normalized results](.mycelium/tasks/backlog/315-validation-pipeline/spec.md) (Effort <L>, Tier <pro>)
- [ ] [316 - Strangler step 6: extract CompliancePipeline and BudgetTracker](.mycelium/tasks/backlog/316-compliance-and-budget-pipelines/spec.md) (Effort <M>, Tier <standard>)
- [ ] [317 - Strangler step 7: move run loop into RunEngine; executor.ts becomes composition root](.mycelium/tasks/backlog/317-run-engine-and-thin-executor/spec.md) (Effort <L>, Tier <pro>)
- [ ] [318 - Add orchestrator unit tests using fakes (no Docker required)](.mycelium/tasks/backlog/318-orchestrator-unit-tests-with-fakes/spec.md) (Effort <M>, Tier <standard>)

### Phase 2 — Boundaries + global state elimination
- [ ] [320 - Introduce AppContext; remove process.env writes from config loading](.mycelium/tasks/backlog/320-app-context-no-process-env/spec.md) (Effort <M>, Tier <standard>)
- [ ] [321 - Refactor core paths to be injected (no env reads inside libraries)](.mycelium/tasks/backlog/321-paths-injected-no-env-reads/spec.md) (Effort <M>, Tier <standard>)
- [ ] [322 - Remove UI→CLI dependency; move shared config wiring to app layer](.mycelium/tasks/backlog/322-ui-decouple-from-cli/spec.md) (Effort <S>, Tier <standard>)
- [ ] [323 - Remove remaining runtime process.env mutations (pass explicit options instead)](.mycelium/tasks/backlog/323-remove-global-env-mutations/spec.md) (Effort <M>, Tier <standard>)

### Phase 3 — Validators consolidation
- [ ] [330 - Create validators shared library (client, IO, normalize, types)](.mycelium/tasks/backlog/330-validators-shared-lib/spec.md) (Effort <M>, Tier <standard>)
- [ ] [331 - Migrate all validators to use validators/lib; delete duplicated helpers](.mycelium/tasks/backlog/331-migrate-validators-to-shared-lib/spec.md) (Effort <L>, Tier <standard>)
- [ ] [332 - Deduplicate validator summary formatting (executor + CLI + UI consume one formatter)](.mycelium/tasks/backlog/332-dedupe-validator-summaries/spec.md) (Effort <M>, Tier <standard>)

### Phase 4 — CLI modularization
- [ ] [340 - Split logs CLI into command modules; move logic into app services](.mycelium/tasks/backlog/340-cli-logs-split-commands/spec.md) (Effort <M>, Tier <standard>)
- [ ] [341 - Split control-plane CLI into command modules; keep adapters thin](.mycelium/tasks/backlog/341-cli-control-plane-split-commands/spec.md) (Effort <M>, Tier <standard>)

### Phase 5 — UI router modularization
- [ ] [350 - Refactor UI router into thin routes + typed query services](.mycelium/tasks/backlog/350-ui-router-query-services/spec.md) (Effort <M>, Tier <standard>)
- [ ] [351 - Standardize UI API error schema and add regression tests](.mycelium/tasks/backlog/351-ui-api-error-schema/spec.md) (Effort <S>, Tier <standard>)

### Phase 6 — Dedup utilities
- [ ] [360 - Deduplicate docker naming and error formatting utilities](.mycelium/tasks/backlog/360-dedupe-docker-and-errors/spec.md) (Effort <M>, Tier <standard>)

### Phase 7 — Docs + ratchet budgets
- [ ] [370 - Add architecture overview + ADRs for layering, ports, and context](.mycelium/tasks/backlog/370-architecture-overview-and-adrs/spec.md) (Effort <M>, Tier <standard>)
- [ ] [399 - Finalize refactor: remove ESLint legacy exemptions and tighten budgets](.mycelium/tasks/backlog/399-ratchet-budgets-and-remove-exemptions/spec.md) (Effort <S>, Tier <standard>)
- [ ] ALL_TASKS_COMPLETE
