# Lessons Learned

## What went well
- Path safety checks centralized so CLI stays lean.
- Dry-run/confirmation flow makes destructive actions easy to reason about.

## What was tricky
- Guarding against path traversal while still allowing normal run ids.

## Unexpected discoveries
- Docker cleanup needed a skip flag so environments without Docker can still clean files.

## Recommendations
- Keep destructive commands behind confirmation or `--force`, and surface a clear hint for opting out of Docker touches.

## Time spent per phase
- Scoping: 0.25h
- Implementation: 1.0h
- Verification: 0.25h
- Review/Polish: 0.25h
