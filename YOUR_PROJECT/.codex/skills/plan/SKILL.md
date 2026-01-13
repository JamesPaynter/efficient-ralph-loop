---
name: plan
description: >
  Read PLAN.md and generate a complete, prioritized task backlog by creating TODO.md
  and a task spec folder for each task under docs/tasks/active/. Produces small,
  sequential, verifiable tasks with stable IDs and consistent folder/link structure.
---

# plan

Read `PLAN.md` and generate a complete task backlog.

## What to do

1. Read `PLAN.md` to understand the project goals
2. Break it down into small, sequential tasks
3. Create `TODO.md` with all tasks listed
4. Create a folder + spec for each task under `docs/tasks/active/`

## Output structure

### TODO.md

```markdown
# TODO

- [ ] [001 - Task name](docs/tasks/active/001-task-name/spec.md) (Effort: S, Tier: mini)
- [ ] [002 - Next task](docs/tasks/active/002-next-task/spec.md) (Effort: M, Tier: mini)
...
- [ ] ALL_TASKS_COMPLETE
````

Guidelines:

* Order by priority (highest first)
* Keep tasks small - if it takes more than a day, split it
* Use action verbs: "Add...", "Implement...", "Create..."
* Always end with `ALL_TASKS_COMPLETE` marker

### Task folders

For each task, create `docs/tasks/active/NNN-task-name/` with three files:

**spec.md:**

```markdown
# Task: [Title]

## Status
- [x] Scoped
- [ ] In Progress
- [ ] Implemented
- [ ] Verified

## Summary

One sentence describing what this task does.

## Effort

- **Effort:** XS | S | M | L | XL
- **Tier:** mini | standard | large

## Files Changing

| File | Change | Description |
|------|--------|-------------|
| path/to/file | create/modify/delete | what changes |

## Blast Radius

- **Scope:** what parts of the system this touches
- **Risk:** low / medium / high
- **Rollback:** how to undo if needed

## Implementation Checklist

- [ ] Step 1
- [ ] Step 2
- [ ] Step 3

## Verification

- [ ] How to confirm this works
- [ ] Expected output

## Dependencies

- **Blocks:** tasks that depend on this
- **Blocked by:** tasks this depends on
```

**scratchpad.md:**

```markdown
# Scratchpad

Working notes during implementation.

---

## Session YYYY-MM-DD

### Notes

### Commands Run

### Open Questions
```

**lessons-learned.md:**

```markdown
# Lessons Learned

## What Went Well

-

## What Was Tricky

-

## Unexpected Discoveries

-

## Recommendations

-
```

## Rules

1. Task IDs are zero-padded: 001, 002, 003...
2. Folder names match task IDs: `001-task-name`
3. Every task needs a verification step - how do we know it's done?
4. Don't create tasks for things already done
5. First task should be project setup if needed (dependencies, structure, etc.)
