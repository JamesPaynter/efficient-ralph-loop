# What GPT changed in this repo (Mycelium hardening + acceptance testing)

This document is intended to be read *diff-first*: it explains what was broken in the provided zip, what was changed, why it was changed, and how to validate the results.

## Executive summary

The zip you provided contained **build/runtime blockers** (imports to non-existent modules) and an **incomplete naming migration** (repo calls itself `mycelium` in the CLI, but packaging, env vars, paths, tests, and some docs still referenced `task-orchestrator`). Those issues prevented reliable “system-level” testing because basic CLI flows could not be trusted.

Changes in this patch focus on three goals:

1. **Make the repo internally consistent as “mycelium” (no backwards-compatibility aliases).**
2. **Restore missing modules and config fields so the CLI + executor can run end-to-end.**
3. **Add high-level acceptance tests that assert outcomes (“this is what I expect to happen”).**

## Breaking changes (intentional)

These are breaking changes relative to the zip you provided, but they are required to honor your request: “the name is mycelium, not task orchestrator; do not include backwards compatibility.”

1. **Package / bin name**
   - `package.json:name` is now `mycelium`.
   - CLI binary is now **only** `mycelium` (no `task-orchestrator` alias).

2. **Global home directory + env var**
   - Replaced `TASK_ORCHESTRATOR_HOME` with **`MYCELIUM_HOME`**.
   - Default home directory is now `~/.mycelium`.

3. **Workspace runtime folder**
   - Workspace-local runtime artifacts now live under `.mycelium/` (previously `.task-orchestrator/`).

If you have scripts or CI that set `TASK_ORCHESTRATOR_HOME` or call `task-orchestrator`, update them to `MYCELIUM_HOME` and `mycelium`.

## Fixes and additions (detailed)

### A) Restored missing source files (hard build/runtime failures)

**Problem:** The repository referenced modules that did not exist, so TypeScript builds and runtime execution would fail.

**Fixes:**

1. `src/core/codex-reasoning.ts` (new)
   - `src/core/executor.ts` imports `./codex-reasoning.js`.
   - Added `resolveCodexReasoningEffort()` and the `CodexReasoningEffort` type.
   - Behavior: passes through the configured value; if unset, returns `undefined` (Codex defaults).

2. `src/cli/init.ts` (new)
   - `src/cli/index.ts` imports `./init.js`.
   - Added `mycelium init` scaffolding to create a repo config at `<repo>/.mycelium/config.yaml`.
   - Also scaffolds:
     - `.mycelium/tasks/`
     - `.mycelium/planning/002-implementation/implementation-plan.md` (stub)
     - `.mycelium/planning/sessions/`
     - `.mycelium/.gitignore` (minimal; intentionally does not ignore all of `.mycelium/`).
   - Important: `init` computes the **installed Mycelium package root** and writes absolute `docker.dockerfile` and `docker.build_context` values so Docker builds work whether you run from a git checkout or a node_modules install.

3. `src/cli/config.ts` (new)
   - `src/cli/index.ts` imports `./config.js`.
   - Added config resolution logic:
     - Explicit `--config <path>` wins.
     - Else, repo-scoped config: `<repo>/.mycelium/config.yaml`.
     - Else, global config: `~/.mycelium/projects/<project>.yaml`.
     - If missing and `initIfMissing=true`, automatically runs repo scaffolding.
   - `buildCli()` now awaits config resolution.

### B) Completed rename to “mycelium” (no compatibility shims)

**Problem:** The CLI described itself as `mycelium`, but packaging and multiple runtime paths still used `task-orchestrator`.

**Fixes:**

1. Packaging / entrypoints
   - `package.json`
     - `name: mycelium`
     - `bin: { "mycelium": "./bin/mycelium" }`
     - `files` includes `GPT-PRO-notes/**/*` so the requested docs ship in `npm pack` artifacts.
   - `package-lock.json`
     - updated top-level package name and `bin` mapping.
   - `bin/`
     - removed `bin/task-orchestrator`
     - added `bin/mycelium`

2. Home dir + env var rename
   - `src/core/paths.ts`
     - replaced `TASK_ORCHESTRATOR_HOME` with `MYCELIUM_HOME`
     - default home `~/.mycelium`

3. Workspace runtime rename
   - `src/core/paths.ts`
     - task codex home now: `<workspace>/.mycelium/codex-home`
   - `worker/state.ts`
     - state file now stored at: `<workspace>/.mycelium/worker-state.json`
   - `worker/index.ts` / `worker/loop.ts`
     - updated references to `.mycelium/` and identity strings.

4. Docker label consistency
   - `src/core/executor.ts` already labels containers with prefix `mycelium.*`.
   - `src/docker/manager.ts` previously filtered on `task-orchestrator.*`.
   - Updated docker manager filters to `mycelium.project` and `mycelium.run_id`.

5. Repository docs and fixtures
   - Updated remaining docs that referenced `task-orchestrator` so the repo reads consistently as Mycelium.
   - Updated the toy fixture repo `.gitignore` to ignore `.mycelium` runtime artifacts.

### C) Config schema alignment (remove latent runtime exceptions)

**Problem:** Code referenced config fields that were not part of the schema, which would lead to either runtime exceptions or “unknown key” validation failures.

**Fixes (in `src/core/config.ts`):**

1. Added `planning_dir` (default: `.mycelium/planning`)
2. Changed default `tasks_dir` to `.mycelium/tasks`
3. Added `worker.reasoning_effort` (optional enum: `minimal|low|medium|high|xhigh`)
4. Docker default image changed to `mycelium-worker:latest`

### D) Workspace hygiene: avoid accidental commits of runtime artifacts

**Problem:** The worker creates runtime artifacts inside a git clone workspace. If those aren’t ignored, they can pollute task branches and cause confusing diffs/merges.

**Fixes:**

1. `src/core/workspaces.ts`
   - Updated `.git/info/exclude` patterns to ignore:
     - `.mycelium/codex-home/`
     - `.mycelium/worker-state.json`
   - Important nuance: we do **not** ignore all of `.mycelium/` because some teams keep planning artifacts or local config there.

2. `worker/loop.ts`
   - Updated “internal file” filtering to ignore:
     - `.mycelium/worker-state.json`
     - `.mycelium/codex-home/…`
   - This prevents runtime files from being treated as “real task output” in manifest compliance.

3. `src/core/workspaces.test.ts` and fixture `.gitignore` updated accordingly.

### E) Mock Codex runner improvements for deterministic budget testing

**Problem:** Budget enforcement logic keys off Codex `turn.completed` events with a `usage` payload. The mock runner previously never emitted usage, so “budget block” scenarios could not be tested deterministically.

**Fix (`worker/codex.ts`):**

1. If `MOCK_CODEX_USAGE` is set, the mock runner emits a synthetic event:
   - `type: "turn.completed"`
   - `usage: { input_tokens, cached_input_tokens, output_tokens }`

This unlocks E2E tests for budget stop behavior without external APIs.

### F) Added system-level acceptance tests (Given/When/Then)

These tests are intentionally higher-level than unit tests. They stand up a real git repo, plan tasks, run tasks, and assert the outcomes.

1. `src/__tests__/manifest-rescope.acceptance.test.ts`
   - Expectation: if a task writes an undeclared file, Mycelium:
     1) detects it via manifest compliance
     2) auto-rescopes the manifest
     3) resets the task
     4) reruns and completes successfully

2. `src/__tests__/budget-block.acceptance.test.ts`
   - Expectation: with `budgets.mode=block`, exceeding `max_tokens_per_task`:
     - fails the run
     - prevents merging into the integration branch

3. `src/__tests__/validator-block.acceptance.test.ts`
   - Expectation: with `test_validator.mode=block` and a failing validator result:
     - fails the run
     - prevents merge
     - marks the task `needs_human_review`

## How to validate (recommended)

From a fresh checkout with dependencies installed:

1. Install dependencies
   - `npm ci`

2. Run unit + integration + acceptance suite
   - `npm test`

3. Packaging smoke test
   - `npm run pack:smoke`

4. Optional Docker tests (requires Docker daemon)
   - `RUN_DOCKER_TESTS=1 npm test`

## Files changed / added (high level)

Added:
- `bin/mycelium`
- `src/cli/config.ts`
- `src/cli/init.ts`
- `src/core/codex-reasoning.ts`
- `src/__tests__/manifest-rescope.acceptance.test.ts`
- `src/__tests__/budget-block.acceptance.test.ts`
- `src/__tests__/validator-block.acceptance.test.ts`
- `GPT-PRO-notes/WHAT_CHANGED.md` (this file)
- `GPT-PRO-notes/implementation-plan.md` (detailed Part 4 plan)
- `GPT-PRO-notes/acceptance-goals.md` (expectations-to-tests mapping)

Modified:
- `package.json`, `package-lock.json`
- `src/core/paths.ts`, `src/core/config.ts`, `src/core/workspaces.ts`, `src/core/workspaces.test.ts`
- `src/docker/manager.ts`
- `worker/state.ts`, `worker/codex.ts`, `worker/index.ts`, `worker/loop.ts`, `worker/loop.test.ts`
- tests + docs referencing legacy naming
