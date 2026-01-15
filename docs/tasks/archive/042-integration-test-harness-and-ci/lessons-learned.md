# Lessons learned

- When wiring per-task state (logs/CODEX_HOME), prepare the git workspace first to avoid tripping workspace validity checks.
- Mock LLM paths need to bypass auth requirements and still emit deterministic file writes so doctor assertions stay meaningful.
- Integration fixtures stay maintainable when doctors target small files and accept per-task narrowing via `TASK_ID`.
