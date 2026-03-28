---
name: cli-coordinator
description: Use when a ClaRTK plan-mode or root coordinator agent needs to partition work, choose read-only versus write-capable agents, and keep transient state in clartk_dev instead of chat memory.
---

1. Claim the active task first:
   - update the existing `docs/tasks/TASK-####-*.md` file before or alongside any coordination change
   - declare owner, write set, checks, and worktree boundaries explicitly
2. Start from live state, not memory:
   - run `node scripts/dev-coordinator-status.mjs`
   - prefer `clartk_dev` queue/run/review state and the dev-console broker over chat summaries
3. Partition by write set:
   - use `repo_explorer`, domain-specific researchers, and `verification_runner` as the default read-only helpers
   - use `implementation_worker` only for isolated write scopes
   - serialize overlapping write sets through one owner
4. Keep queue names explicit:
   - avoid `default` for feature-specific work
   - use a domain-prefixed queue such as `coordination.ui-review`, `hardware.build`, or `gateway.fixture-verify`
5. Emit a handoff packet for every bounded slice:
   - task
   - owner
   - write set
   - queue
   - checks
   - blockers
   - evidence links
6. Keep the coordinator supervised:
   - no direct code mutation unless the coordinator is explicitly reassigned as the write owner
   - escalate unclear ownership, unresolved blockers, or cross-cutting contract changes instead of improvising
7. Use `docs/operations/cli-coordinator-workflow.md` as the durable workflow reference.
