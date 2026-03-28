# CLI Coordinator Workflow

- Status: Draft
- Date: 2026-03-27
- Scope: plan-mode or coordination-first Codex CLI sessions for ClaRTK

## Goal

- Give the coordinating agent in another terminal a stable repo-native workflow for:
  - claiming the active task
  - checking live dev-plane state
  - partitioning read-only versus write-capable work
  - emitting clean handoffs without overlapping write sets

## Start-of-session defaults

- Keep `gpt-5.4` as the default model for ClaRTK coordination and coding work.
- Keep high reasoning for complex planning and multi-step coordination.
- Keep `max_depth = 1` and bounded thread count unless ClaRTK-specific evals justify deeper delegation.
- For a new terminal session, prefer the coordinator profile:

```bash
codex --profile coordinator
```

- For an already-running coordinator session, use the repo artifacts below even if the session was started without that profile.

## Canonical coordination sources

1. The active task file in `docs/tasks/`
2. `AGENTS.md`
3. Live dev-plane state from `clartk_dev` surfaced through the dev-console broker
4. Checked repo files and passing verification output

- Do not rely on chat history as the durable source of ownership, queue state, or review status.

## Live status command

- Use this before assigning work or reusing a stale assumption:

```bash
node scripts/dev-coordinator-status.mjs
```

- The script signs in with the bootstrap admin account, then summarizes:
  - workspace and service health
  - queue snapshots
  - recent agent runs
  - recent UI review runs
  - docs and skill catalog counts
- Use `--json` when another tool or script needs structured output.

## Role selection

- `cli_coordinator`:
  coordination-only role for task selection, write-set partitioning, and handoff quality
- `repo_explorer`:
  read-only file and ownership discovery
- `verification_runner`:
  checks, reproducibility, and failure confirmation
- `implementation_worker`:
  isolated write-owner for one bounded path set
- `ui_review_reviewer`:
  read-only supervision of stored UI review evidence
- domain researchers:
  use only when the slice is clearly within that domain and still read-only by default

## Queue and ownership rules

- One write-capable agent owns one path set.
- Overlapping write scopes must be serialized.
- Concurrent write work requires separate Git worktrees.
- Read-only exploration and verification can run in parallel without separate worktrees.
- Avoid `default` for scoped feature or validation work.
- Preferred queue naming:
  - `<domain>.<feature>`
  - `<domain>.<feature>.<phase>`
- Examples:
  - `coordination.ui-review`
  - `hardware.base-station`
  - `gateway.fixture-verify`

## Handoff packet

- Every bounded slice should leave a packet with:
  - task file
  - owner
  - write set
  - queue
  - checks
  - blockers
  - evidence links

## External research rule

- For local repo development, keep transient scheduling and evidence in `clartk_dev`.
- If ClaRTK later adds OpenAI API-backed long-running research workers, use background mode and webhooks for those external research tasks rather than stretching local interactive sessions indefinitely.
- Keep that future path separate from the current local Codex CLI development loop.

## Verified external guidance

- Codex supports project-scoped overrides in `.codex/config.toml` and exposes plan-mode reasoning plus agent thread/depth controls:
  https://developers.openai.com/codex/config-reference/#configtoml
- `gpt-5.4` is the default model for broad coding and multi-step workflows, and OpenAI recommends high reasoning for complex coding and planning tasks:
  https://developers.openai.com/api/docs/guides/latest-model/
- Codex guidance recommends using the general-purpose `gpt-5.4` model for most coding tasks:
  https://developers.openai.com/api/docs/guides/code-generation/#use-codex
- GPT-5.4 prompt migration guidance recommends switching one variable at a time, pinning reasoning, and running evals before further tuning:
  https://developers.openai.com/api/docs/guides/prompt-guidance/#migrate-prompts-to-gpt-54-one-change-at-a-time
- OpenAI deep-research guidance recommends background mode and webhooks for long-running external research tasks:
  https://developers.openai.com/api/docs/guides/deep-research/#best-practices
