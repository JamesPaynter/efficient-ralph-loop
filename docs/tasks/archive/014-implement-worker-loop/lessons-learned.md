# Lessons Learned

## What went well
- Splitting the worker into logging/codex/loop modules made the flow easier to scan and reason about.
- Adding a small CLI around env parsing surfaced missing config early and keeps manual runs simple.

## What was tricky
- Keeping logging payloads JSON-safe while still including optional context (branch, timeouts) required a little filtering.

## Unexpected discoveries
- The executor already passes a rich env contract, so the worker only needs to normalize it and stay out of the way.

## Recommendations
- Add a tiny fixture to exercise the worker loop with a fake doctor command and ensure retry output looks sane.

## Time spent per phase
- Scoping: 0.5h
- Implementation: 2h
- Verification: 0.5h
- Review/Polish: 0.25h
