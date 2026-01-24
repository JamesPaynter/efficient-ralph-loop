# Acceptance goals: “THIS IS WHAT I EXPECT TO HAPPEN” → tests

This file is the operator-facing contract for Mycelium behaviors. Each goal is written as a plain-language expectation and then mapped to automated tests (present today) and planned tests (Part 4 backlog).

Legend:
- **Tier 0** = Safety (never-merge / never-corrupt)
- **Tier 1** = Primary workflows
- **Tier 2** = Nice-to-have coverage and UX

---

## Tier 0 — Safety and non-negotiables

### G0.1 No merge when a validator blocks

**Expectation:**
> If a configured validator returns a failing/blocked verdict with `mode: block`, Mycelium must not merge any task branches into the integration branch, and the task must be flagged for human review.

**Automated test(s):**
- `src/__tests__/validator-block.acceptance.test.ts`

**Key assertions:**
- Run ends in `state.status = failed`
- Task ends in `status = needs_human_review`
- Integration branch HEAD does not change

---

### G0.2 No merge when budgets block

**Expectation:**
> If `budgets.mode = block` and a budget threshold is exceeded, Mycelium must stop before merge and mark the run failed.

**Automated test(s):**
- `src/__tests__/budget-block.acceptance.test.ts`

**Key assertions:**
- Run ends in `state.status = failed`
- Integration branch HEAD does not change

---

### G0.3 Undeclared file access triggers rescope and retry

**Expectation:**
> If a task writes/reads a file outside its manifest, Mycelium must detect it via compliance, update (rescope) the manifest when possible, reset the task to pending, and retry until the task can complete compliantly.

**Automated test(s):**
- `src/__tests__/manifest-rescope.acceptance.test.ts`

**Key assertions:**
- Task attempts >= 2
- Planned manifest is updated to include the newly accessed file
- Final run completes successfully

---

### G0.4 No corrupt state files

**Expectation:**
> A crash during state writing must not leave a truncated or malformed state file; state writes must be atomic.

**Automated test(s):**
- Existing unit/integration coverage in `src/core/state-store` tests (extend in Part 4).

**Planned test(s) (Part 4 backlog):**
- Fault-injection acceptance test that kills the process mid-write and verifies recovery from `.tmp`.

---

## Tier 1 — Primary workflows

### G1.1 Plan produces task directory artifacts

**Expectation:**
> `mycelium plan` writes a `_plan.json` index plus per-task `manifest.json` and `spec.md` under the configured tasks directory.

**Automated test(s):**
- Existing integration coverage in `src/__tests__/integration-run.test.ts` (extend to assert plan index contents in Part 4).

---

### G1.2 Run executes tasks and merges when allowed

**Expectation:**
> `mycelium run` executes planned tasks, merges them into the integration branch in batch order, and runs the integration doctor after each merge.

**Automated test(s):**
- `src/__tests__/integration-run.test.ts` (mock LLM, local worker)

---

### G1.3 Resume continues without repeating completed tasks

**Expectation:**
> After an interrupted run, `mycelium resume` continues from persisted state and does not rerun completed tasks.

**Automated test(s):**
- Existing resume test coverage (extend and convert to acceptance-level in Part 4).

---

## Tier 2 — UX, observability, and performance

### G2.1 Logs are queryable and complete

**Expectation:**
> Every run emits structured logs with correlation fields that allow reconstructing: what happened, which task, which attempt, and why a run stopped.

**Planned test(s) (Part 4 backlog):**
- Log schema validation test + “minimum artifact set” assertions.

---

### G2.2 Docker mode parity

**Expectation:**
> Docker mode and local-worker mode produce equivalent state transitions and safety outcomes.

**Planned test(s) (Part 4 backlog):**
- Docker-enabled acceptance suite in CI with a matrix of sandbox/network settings.

---

## Backlog index (Part 4)

This section is a concrete TODO list (each line should become a ticket):

1. Fault injection: SIGKILL during state write → recover from `.tmp`.
2. Fault injection: Docker daemon unavailable mid-run → graceful stop + resume.
3. Resume idempotency: resume twice → second resume performs no extra work.
4. Concurrency: conflicting resource locks → second task waits / batches split correctly.
5. Observability: log schema + required fields gate.
6. Security: ensure no secrets appear in logs (redaction tests).
7. Performance: run with 50+ small tasks → throughput metrics within threshold.
