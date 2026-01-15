# Lessons learned

- Keep log helpers pure/testable (timeline/failure grouping) so CLI output is easy to verify.
- When adding optional LLM flows, gate them behind config and keep rule-based summaries first to avoid blocking users without credentials.
