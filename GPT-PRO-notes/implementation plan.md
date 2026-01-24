# Implementation plan (Part 4): System hardening + “bulletproof” acceptance testing

This plan expands **Part 4** into an implementation program that turns operator expectations (“THIS IS WHAT I EXPECT TO HAPPEN”) into deterministic, automated, system-level tests and reliability gates.

Part 4 assumes Parts 1–3 already exist (planning, workspace execution, Docker orchestration) and focuses on:

- **Correctness**: behaviors match documented expectations.
- **Resilience**: predictable handling of failure modes.
- **Observability**: enough structured logs and artifacts to explain *why* a behavior occurred.
- **Repeatability**: tests are deterministic, low-flake, and runnable locally + in CI.

The deliverable is a **test program** plus the **supporting harnesses** and **quality gates** to make “100% bulletproof” a realistic engineering target.

---

## 4.0 Definitions and non-goals

### 4.0.1 Definitions

- **Acceptance test**: a black-box or gray-box scenario that exercises CLI → planner → executor → worker and asserts end outcomes (branch state, logs, artifacts, and task/run state).
- **Reliability gate**: a measurable threshold enforced in CI (e.g., “0 flakes across 50 runs” or “no merge occurs when validator blocks”).
- **Deterministic harness**: test environment that makes outputs predictable (mocked LLM, fixed clocks, deterministic run IDs, controlled git repos, controlled Docker availability).
- **Failure injection**: intentionally introducing faults (SIGKILL, Docker daemon unavailable, network egress blocked, disk full simulation) to verify recovery logic.

### 4.0.2 Non-goals

- Proving semantic correctness of arbitrary AI-generated code (this is inherently non-decidable). The goal is to harden **Mycelium’s orchestration contract**, not “perfect LLM output.”
- Replacing unit tests. Unit tests remain valuable; Part 4 adds *system-level* verification.
- Supporting multiple legacy names/aliases. The repo standard is **mycelium** only.

---

## 4.1 Definition of Done (DoD)

Part 4 is complete when all the following are true:

### 4.1.1 Acceptance coverage

1. **Acceptance goals are written and versioned** (see `GPT-PRO-notes/acceptance-goals.md`).
2. Each goal has:
   - a canonical “Given / When / Then” scenario
   - a primary test (automated)
   - explicit expected artifacts (logs, branch mutations, state transitions)
3. Coverage thresholds:
   - 100% of *Tier-0* goals (safety and “never merge when blocked”) are automated.
   - ≥80% of *Tier-1* goals (core operator workflows) are automated.
   - Remaining Tier-1/Tier-2 gaps are documented with an implementation ticket list.

### 4.1.2 Reliability gates

CI enforces the following gates:

- **No merge safety gate**: any test configured to block (validator/budget/manifest enforcement) must prove no integration-branch merge occurs.
- **Resume correctness gate**: at least one test exercises resume with a pre-existing run state and validates idempotent continuation.
- **Artifact schema gate**: log lines validate against a log schema (or a schema contract) and include required correlation fields.
- **Flake gate**: acceptance suite must run cleanly N times (e.g., 10) in CI without flakes; failures are quarantined with a hard deadline and not allowed to silently persist.

### 4.1.3 Operational readiness

- A “how to debug a failed run” runbook exists and is validated by tests that assert required log artifacts exist.
- Cleanup and idempotency behaviors are explicitly tested (no orphaned workspaces; no silent clobbers without `--force`).

---

## 4.2 Acceptance goals → tests traceability (the backbone)

### 4.2.1 Goal taxonomy

Define three tiers:

- **Tier 0 (Safety / Non-negotiable)**
  - Never merge when: budget blocks, validator blocks, manifest enforcement blocks, merge conflict occurs.
  - Never corrupt run state (atomic writes).
  - Never leave the integration branch in an untested state (doctor contract).

- **Tier 1 (Core workflow)**
  - `plan` writes tasks deterministically.
  - `run` executes tasks, merges batches, runs doctor, and marks state correctly.
  - `resume` continues from previous run artifacts and does not redo completed tasks.
  - `status` reflects reality.

- **Tier 2 (Hardening / Edge cases)**
  - Docker daemon disruptions.
  - Network restrictions (`network_mode=none`).
  - Large repo / high parallelism.
  - Partial failures inside a batch.

### 4.2.2 Goal definition template

Each goal must be written using this template:

1. **Statement**: “This is what I expect to happen …”
2. **Scope**: plan/run/resume/clean/logs
3. **Config preconditions**: relevant config knobs
4. **Given / When / Then**
5. **Artifacts**:
   - state file changes
   - expected log events (types)
   - expected git outcomes (branch heads)
6. **Negative assertions** (the “must not happen” list)
7. **Implementation hook** (test harness + fixtures needed)

### 4.2.3 Traceability matrix

Create and maintain a matrix table:

- Goal ID (G0.1, G1.3, …)
- Goal text
- Test file(s)
- Assertions (brief)
- Flake risk rating
- CI job(s)
- Owner / follow-up

This matrix is the authoritative answer to: “Do we test the behaviors we claim?”

---

## 4.3 Test architecture

### 4.3.1 Test layers

Part 4 uses multiple layers; each layer has different purpose and cost:

1. **CLI smoke tests** (seconds)
   - `mycelium --help` and subcommand `--help`
   - Packaging sanity (`npm pack` includes bin/templates/docs)

2. **Acceptance tests (local-worker)** (tens of seconds)
   - Use mock planner + mock worker
   - No Docker dependency
   - Validate orchestration semantics and git merge behavior

3. **Acceptance tests (Docker mode)** (minutes)
   - Validate container lifecycle, volume mounts, permissions, label filtering
   - Run behind a feature flag in CI (e.g., `RUN_DOCKER_TESTS=1`)

4. **Fault-injection / chaos tests** (minutes; can be nightly)
   - Kill worker mid-task
   - Kill orchestrator mid-batch
   - Simulate Docker daemon outage
   - Validate resume behavior

5. **Performance/regression tests** (nightly)
   - Throughput under N tasks
   - Workspace cleanup time
   - Log index query time

### 4.3.2 Harness principles

To keep tests stable:

- Use **temporary directories** for repos and Mycelium home (`MYCELIUM_HOME`).
- Use **deterministic planner outputs** via mock LLM fixtures.
- Use **deterministic worker effects**:
  - mock worker writes exactly what the manifest permits
  - optional synthetic token usage via `MOCK_CODEX_USAGE`
- Avoid reliance on wall clock and randomness:
  - allow injecting `runId` (or parse returned runId)
  - use fixed branch names

### 4.3.3 Fixtures strategy

Maintain small fixture repos:

- `toy-repo`: minimal Node project with doctor script.
- `conflict-repo`: crafted to cause deterministic merge conflicts.
- `large-repo-sim`: generated repo (many files) used for performance tests.

Each fixture must:

- be fast to clone/init
- have deterministic doctor behavior
- isolate “repo complexity” from “orchestrator complexity”

---

## 4.4 Concrete acceptance scenarios (system-level)

This section lists the most important scenarios and the exact test mechanics.

### 4.4.1 G0.1 — Budget mode=block prevents merge

**Expectation**

If configured with `budgets.mode=block` and the run exceeds a budget threshold, Mycelium must:

- stop the run
- mark run as failed with a budget stop reason
- **not merge** any batch content into the integration branch

**Test design**

- Planner returns a single task that would normally succeed.
- Mock worker emits `turn.completed` with `usage` via `MOCK_CODEX_USAGE`.
- Set `max_tokens_per_task` very low.

**Assertions**

- `state.status === "failed"`
- integration branch HEAD unchanged
- orchestrator log contains `budget.block`

**Implementation**

- `src/__tests__/budget-block.acceptance.test.ts`

**Follow-on enhancements**

- add run-level cost budget case
- add warn-mode case (should log warning but continue)

### 4.4.2 G0.2 — Validator mode=block prevents merge and flags human review

**Expectation**

If `test_validator.mode=block` and the validator reports `pass=false`, Mycelium must:

- mark the task `needs_human_review`
- fail the run
- prevent merge

**Test design**

- Planner fixture returns one task.
- Planner uses `MOCK_LLM_OUTPUT_PATH`.
- After planning, swap the mock LLM output to inline JSON for validator failure.

**Assertions**

- run status failed
- task status `needs_human_review`
- integration branch HEAD unchanged
- validator report exists in logs

**Implementation**

- `src/__tests__/validator-block.acceptance.test.ts`

### 4.4.3 G1.1 — Manifest auto-rescope (warn mode) retries and completes

**Expectation**

If a task writes outside its declared manifest, Mycelium should:

1. detect compliance violations
2. update the manifest (auto-rescope) when possible
3. reset the task to pending and retry
4. complete successfully after rescope

**Test design**

- Planner outputs a task with `files.writes: []` so mock worker writes fallback `mock-output.txt`.
- Compliance detects undeclared write.
- Rescope adds `mock-output.txt` into manifest.
- Retry succeeds.

**Assertions**

- task attempts >= 2
- manifest.json updated to include `mock-output.txt`
- file exists on integration branch

**Implementation**

- `src/__tests__/manifest-rescope.acceptance.test.ts`

---

## 4.5 Part 4 workstreams (detailed)

This section is the “extreme detail” build plan: tasks, code touchpoints, test suites, and expected outputs.

### 4.5.1 Workstream A — Acceptance goals and traceability

**Deliverables**

- `GPT-PRO-notes/acceptance-goals.md` updated to include Tier 0–2 goals
- `GPT-PRO-notes/traceability-matrix.md` (recommended) mapping goals ↔ tests

**Implementation steps**

1. Draft Tier 0 goals first (budget/validator/manifest/merge conflict/atomic state).
2. For each goal, write:
   - Given/When/Then
   - negative assertions
   - artifacts expected
3. Add each goal to the matrix with:
   - test file path
   - config knobs used
   - CI job

**Review checklist**

- Every goal is phrased as an observable behavior.
- Every goal specifies at least one negative assertion (“must not merge”).
- Every goal references concrete artifacts (file paths and log event types).

### 4.5.2 Workstream B — Black-box CLI harness

**Why**

Unit tests won’t catch packaging or argument-parsing regressions. A black-box harness catches:

- missing bin mappings
- broken help text
- command wiring issues
- broken default config discovery

**Deliverables**

- A new test harness module (e.g., `test/harness/cli.ts`) that can:
  - run `node dist/index.js ...` or `bin/mycelium ...`
  - capture stdout/stderr
  - assert exit codes

**Key scenarios**

1. `mycelium --help` returns exit 0
2. `mycelium init` creates `.mycelium/config.yaml`
3. `mycelium status` handles “no runs yet” cleanly
4. `mycelium logs query` works for a small synthetic log index

**Hardening details**

- Normalize paths in assertions to avoid platform-specific separators.
- Avoid matching full help output; assert key invariants (command exists, options exist).

### 4.5.3 Workstream C — Resume / crash recovery matrix

**Why**

Operators will experience:

- SIGINT/SIGTERM during runs
- machine reboots
- docker restarts

Resume must be correct and idempotent.

**Deliverables**

- A “resume drill” suite that exercises:
  - orchestrator process termination mid-run
  - resume continues remaining tasks
  - completed tasks are not re-run

**Scenarios**

1. Kill orchestrator after first batch merge but before second batch starts.
2. Kill worker container during a task; resume should detect exited container and restart.
3. Kill Docker daemon (if running docker-mode tests) and verify graceful error + resume possible after daemon returns.

**Implementation approach**

- In local-worker mode, simulate crash by throwing after the first task completion hook.
- In Docker mode, simulate by stopping/removing container externally.

**Assertions**

- run state persists (state file exists and is valid JSON)
- resumed run continues from last known state
- no duplicate merges

### 4.5.4 Workstream D — Docker-mode parity tests

**Why**

Most hard production bugs will be in:

- volume mounts
- file ownership/perms
- network isolation
- container discovery via labels

**Deliverables**

- A Docker E2E suite gated behind an env flag.

**Scenarios**

1. Container labels are correct and docker manager finds them.
2. `network_mode=none` still executes tasks that do not need network.
3. Workspace mounts are read/write as expected.
4. Cleanup stops/removes containers when configured.

**Assertions**

- container count and label queries match expected
- task logs exist and are populated

### 4.5.5 Workstream E — State + artifact invariants

**Why**

When something goes wrong, the operator must have enough breadcrumbs to debug.

**Deliverables**

- A schema (or contract) for orchestrator events and worker events.
- Tests that validate:
  - required fields exist (`ts`, `type`, `task_id` when applicable)
  - events are parseable JSON
  - per-run directories exist

**Implementation steps**

1. Define a minimal JSON schema for:
   - orchestrator.jsonl lines
   - task events.jsonl lines
2. Add tests that read logs produced by acceptance tests and validate schema.

### 4.5.6 Workstream F — Locking + scheduling correctness

**Why**

Deadlocks, starvation, or incorrect parallelism can silently corrupt outcomes.

**Deliverables**

- Tests that plan batches across tasks with overlapping resource locks.
- Tests that ensure no two tasks with conflicting `locks.writes` run in the same batch.

**Scenarios**

1. Two tasks both write `repo` → must serialize.
2. One task reads `repo`, another writes `repo` → must serialize (depending on model).
3. Disjoint resources → can run concurrently.

**Assertions**

- batch plan structure matches expected sets
- executor never violates lock semantics

### 4.5.7 Workstream G — Security and isolation checks

**Why**

Mycelium runs untrusted code in workspaces. Even in local-worker mode, guardrails matter.

**Deliverables**

- Docker-mode tests verifying network isolation when configured.
- Static checks:
  - no accidental secret persistence in logs
  - no path traversal in artifact writes

**Concrete checks**

1. Ensure workspace runtime artifacts are ignored and do not appear in git diffs.
2. Ensure task log writing does not allow `..` escapes.

### 4.5.8 Workstream H — Performance and regression baselines

**Deliverables**

- A small benchmark harness (nightly) that measures:
  - planning time for X tasks
  - execution scheduling overhead
  - log indexing/query time

**Thresholds**

- Baselines committed; CI alerts on regressions > N%.

---

## 4.6 CI integration plan

### 4.6.1 Job matrix

Recommended GitHub Actions jobs:

1. `lint-typecheck` (fast)
2. `unit-and-acceptance-local` (default)
3. `docker-e2e` (optional; runs on schedule or when label applied)
4. `chaos-nightly` (scheduled)

### 4.6.2 Flake handling policy

- Any acceptance test that flakes is:
  1) tagged/quarantined within 24 hours
  2) must have an issue with root-cause hypothesis
  3) cannot remain quarantined beyond a fixed SLA (e.g., 7 days)

### 4.6.3 Determinism requirements

CI should:

- set `MYCELIUM_HOME` to a temp directory
- set mock LLM fixtures explicitly
- avoid dependence on global git config

---

## 4.7 Implementation checklist (ordered)

If you want the fastest path to “bulletproof,” implement in this order:

1. Tier-0 acceptance tests + gates (merge safety)
2. CLI black-box harness (packaging + command wiring)
3. Resume matrix (crash recovery)
4. Docker parity tests (container discovery + mounts)
5. Log schema contract validation
6. Locking correctness tests
7. Nightly chaos + perf baselines

---

## 4.8 Appendix: recommended file layout

```
test/
  harness/
    cli.ts
    repos.ts
    env.ts
  fixtures/
    toy-repo/
    conflict-repo/
    large-repo-sim/
src/__tests__/
  ... acceptance tests ...
GPT-PRO-notes/
  acceptance-goals.md
  traceability-matrix.md
  implementation-plan.md
```

---

## 4.9 Appendix: acceptance test authoring rules

To keep the suite maintainable:

1. Every acceptance test must assert at least one **negative outcome** (what must not happen).
2. Every acceptance test must leave the filesystem clean (remove temp dirs).
3. Every acceptance test must set and restore environment variables.
4. Every acceptance test must be deterministic (no random run IDs in assertions; parse runId returned by the run).
5. Prefer fixtures + mocks to real network calls.
