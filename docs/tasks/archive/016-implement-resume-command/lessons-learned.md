# Lessons Learned

## What went well
- Adding explicit resume/log helpers kept the executor changes localized and easier to scan.

## What was tricky
- Avoiding silent new runs when resuming required careful run_id resolution and guardrails.

## Unexpected discoveries
- Multiple CLI commands duplicated "latest run" lookup logic; centralizing it in the state store simplified reuse.

## Recommendations
- Prefer the shared state-store helpers for run resolution in future commands to avoid drift.

## Time spent per phase
- Scoping: 0.2h
- Implementation: 1.2h
- Verification: 0.3h
- Review/Polish: 0.2h
