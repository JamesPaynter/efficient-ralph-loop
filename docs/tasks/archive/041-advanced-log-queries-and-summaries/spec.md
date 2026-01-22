# 041 — Advanced log queries + summaries (timeline, follow, failure digest)

## Status
- [x] Scoped
- [x] In Progress
- [x] Implemented
- [x] Verified

## Summary
Build operator-grade log queries: live follow, run timeline, failure digest, and optional LLM summarization of failed tasks.

## Model & Effort
- Effort: **L**
- Tier: **pro**

## Files Changing
...
- [x] Extend `logs` command with `--follow` to tail orchestrator + task logs for the active run.
- [x] Add `logs timeline` to show batch/task start/stop, retries, merges, and total durations.
- [x] Add `logs failures` to group by failure type and show top snippets/stack traces.
- [x] If SQLite index is enabled: use it; otherwise fall back to scanning JSONL files.
- [x] Add optional `logs summarize --task <id>` using LLM (configurable, off by default).
- [x] Ensure summaries include: last doctor output, last Codex turn, validator results, and likely next action.

## Verification
- Manual: run `logs --follow` during an active run and confirm streaming output.
- Manual: run `timeline` on a completed run and confirm it matches state file.
- [x] `npm test`
- [x] `npm run build`

## Dependencies
### Blocks
- 042

### Blocked by
- 027
- 018
- 037
- 038
