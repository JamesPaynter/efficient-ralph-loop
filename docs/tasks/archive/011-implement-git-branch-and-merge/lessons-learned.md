# Lessons Learned

## What went well
- Centralized merge logic and conflict detection made the executor simpler to read.
- Small git fixture helpers kept the merge tests focused and quick to run.

## What was tricky
- Merge fixtures that add the same new file still conflict; needed to adjust the happy-path test to use distinct files.

## Unexpected discoveries
- Git considers two branches adding the same path with different contents a conflict even when the edits look independent.

## Recommendations
- Seed merge test repos with baseline files and vary touched paths to avoid accidental conflicts when verifying success cases.

## Time spent per phase
- Scoping: 10m
- Implementation: 60m
- Verification: 10m
- Review/Polish: 10m
