# Lessons Learned

## What went well
- Added strict manifest validation plus loader options without changing the executor call sites too much.

## What was tricky
- Balancing strict validation defaults with the need to surface errors without stopping the whole run.

## Unexpected discoveries
- Task manifest definitions already existed under a different filename, so aligning with the TODO specs required a rename.

## Recommendations
- Consider exposing the loader's non-strict mode via CLI flags for future dry-run diagnostics.

## Time spent per phase
- Scoping: 0.25h
- Implementation: 1.0h
- Verification: 0.25h
- Review/Polish: 0.25h
