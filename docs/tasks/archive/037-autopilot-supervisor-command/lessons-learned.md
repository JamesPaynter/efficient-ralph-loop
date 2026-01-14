# Lessons learned

- Keep interactive loops deterministic by forcing the LLM to pick from a small action schema (`ask` vs `synthesize`) and guarding with a max question count.
- Append planning artifacts with session headers so multiple autopilot passes stay readable without clobbering earlier plans.
- Progress reporters that poll run state keep the supervisor CLI feeling alive without changing the executor.
