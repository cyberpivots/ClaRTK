# ADR-002: Agent Operating Model

- Status: Accepted
- Date: 2026-03-25

## Decision

ClaRTK will use:

- one root `AGENTS.md`
- repo-local skills in `.agents/skills`
- repo-local agent profiles in `.codex/agents`
- worktree-based isolation for concurrent write tasks

## Rationale

- The repo is intended for repeated multi-agent work.
- AGENTS, skills, and agent-role configs must live with the repo so behavior is reproducible across sessions.

