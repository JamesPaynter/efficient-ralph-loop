# Lessons learned

- Automatic rescope works well when treated as a first-class state transition with dedicated log events.
- The trickiest part was keeping scheduler/batch accounting aware of the new `rescope_required` status so reruns stay safe.
- Planner-driven rescope remains open; current flow leans on deterministic lock/file expansion and could be extended later.
