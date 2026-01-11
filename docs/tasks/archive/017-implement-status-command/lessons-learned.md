# Lessons Learned

## What went well
- Centralizing run summaries in the state store kept the CLI output lean and reusable.
- Normalizing task rows up front made the table formatting predictable.

## What was tricky
- Balancing a concise status output with enough per-status counts required a small formatting pass.

## Unexpected discoveries
- Multiple CLI commands still had custom "latest run" resolution; leaning on shared helpers avoids drift.

## Recommendations
- Prefer `summarizeRunState` (or similar helpers) for future status/log-style commands to keep logic aligned.

## Time spent per phase
- Scoping: 0.3h
- Implementation: 1.0h
- Verification: 0.2h
- Review/Polish: 0.2h
