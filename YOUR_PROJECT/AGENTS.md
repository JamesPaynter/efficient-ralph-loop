# AGENTS.md

## Task system

Work is tracked in `TODO.md`. Each task links to a spec in `docs/tasks/active/`.

```
docs/tasks/
├── _template/          # copy this to start a new task
├── active/             # tasks in progress
│   └── 001-task-name/
│       ├── spec.md
│       ├── scratchpad.md
│       └── lessons-learned.md
└── archive/            # completed tasks
```

### Workflow

1. Read `TODO.md`, pick the highest priority incomplete task
2. Read the task's `spec.md`
3. Implement it
4. Update `scratchpad.md` with notes as you go
5. Verify using the spec's verification steps
6. Mark task complete in `TODO.md`
7. Commit
8. Stop

### Task lifecycle

- When done: check off in `TODO.md`, move folder to `archive/`
- If scope grows: add new tasks to `TODO.md`, don't expand the current one


## Commits

Use bracketed prefixes:

- `[FEAT]` new functionality
- `[FIX]` bug fix
- `[DOCS]` documentation only
- `[REFACTOR]` internal change, no behavior change
- `[TEST]` add or update tests
- `[CHORE]` maintenance

Keep commits small and focused. One logical change per commit.


## Coding style & conventions

Follow **Easy Scan** principles throughout. Code should be readable at a glance.

### Code style: Easy Scan

Code should be scannable at a glance. Optimize for quick comprehension, not brevity. 
Readable doesn't mean over-engineered. Don't add abstractions you don't need yet.

### Naming
- Descriptive names, no abbreviations (`user_input_text` not `txt`)
- Functions say what they do (`load_config_from_disk` not `load`)
- Booleans read as questions (`is_valid`, `has_loaded`, `should_retry`)

### Structure
- Code flows top to bottom
- One responsibility per function
- Early returns to reduce nesting
- Group related functions together

### Comments
- Explain WHY, not WHAT
- No commented-out code


## Verification

Every task needs a verification step. "It works" is not verification.

Good:
- `python -m pytest tests/`
- `python render.py && ls output/*.png`
- "Output image shows black hole with accretion disk"

Bad:
- "Check that it works"
- "Looks good"


## When stuck

1. Re-read the spec
2. Check scratchpad for prior attempts
3. Simplify - do the smallest thing that could work
4. If blocked, document why in scratchpad and stop
