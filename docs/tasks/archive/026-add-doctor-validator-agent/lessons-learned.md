# Lessons Learned

## What went well
- Reusing the test validator structure kept the doctor validator implementation focused and small.

## What was tricky
- Normalizing doctor log ordering across tasks/attempts while keeping prompts concise required a small amount of path/mtime plumbing.

## Unexpected discoveries
- Integration doctor output was not persisted; capturing and threading a snippet into the validator context improves signal for failure cases.

## Recommendations
- Keep validator outputs advisory and concise; log paths/snippets alongside summaries to reduce hunting during reviews.

## Time spent per phase
- Scoping: 0.5h
- Implementation: 2h
- Verification: 0.5h
- Review/Polish: 0.5h
