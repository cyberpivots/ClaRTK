# Agent Coordination

## Write Safety

- Parallel editing is opt-in.
- One write-capable agent owns one path set.
- Overlapping write sets must be serialized.
- Use a dedicated Git worktree for each concurrent write task.

## Task Files

- Track non-trivial work in `docs/tasks/TASK-####-slug.md`.
- Required fields: `Owner`, `Write Set`, `Worktree`, `Depends On`, `Checks`, `Status`.

## Escalation

- If fixture format, vendor behavior, or redistribution rights are unclear, stop and document the blocker instead of guessing.

