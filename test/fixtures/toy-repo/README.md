# Toy repo for integration tests

This repository is intentionally tiny. The doctor command expects mocked updates to:

- `notes/release-notes.txt`
- `src/feature.txt`

The integration harness uses a mock planner and mock Codex runner to write those files.
