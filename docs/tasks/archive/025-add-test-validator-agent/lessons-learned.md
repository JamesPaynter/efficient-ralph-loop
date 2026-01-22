# Lessons Learned

## What went well
- Validator pipeline is isolated with dedicated logs and report files, making it easy to inspect results without affecting merges.

## What was tricky
- Git status can surface untracked directories (e.g., `.tasks/`) which need filtering before reading file contents to avoid EISDIR errors.

## Unexpected discoveries
- Directory entries from `git status --porcelain` require an explicit file check; adding a `stat` guard kept the validator resilient.

## Recommendations
- Consider centralizing git diff/status helpers so future validators can reuse the directory filtering and deduplication logic.

## Time spent per phase
- Scoping: 0.2h
- Implementation: 1.4h
- Verification: 0.4h
- Review/Polish: 0.3h
