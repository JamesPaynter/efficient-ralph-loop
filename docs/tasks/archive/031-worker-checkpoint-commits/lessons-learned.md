# Lessons learned

- Amending the checkpoint commit to the final message keeps history clean while still preserving the latest checkpoint SHA in worker state.
- Syncing worker checkpoints into run state needs attempt-based deduping to avoid stale entries from earlier runs.
- Mocking `CodexRunner` keeps worker loop tests fast and deterministic.
