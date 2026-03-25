# TASK-0050 OpenAI Docs MCP

- Owner: initial agent
- Write Set: MCP configuration, AGENTS.md references, setup docs
- Worktree: separate worktree required for write-capable agent
- Depends On: TASK-0001
- Checks: `codex mcp list`, `codex mcp get openaiDeveloperDocs`, AGENTS.md/reference doc review, VS Code Agent-mode smoke test
- Status: completed for MCP installation; clean transcript captured; retry required for tools-picker screenshot artifact

## Goal

- Add the `openaiDeveloperDocs` MCP server and document it before future agents rely on docs-MCP-first OpenAI workflows.

## Completed Changes

- Installed the shared Codex MCP entry with `codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp`.
- Added project-local VS Code workspace configuration at `.vscode/mcp.json`.
- Updated `AGENTS.md` to require OpenAI Docs MCP first for OpenAI product questions, with `openai-docs` plus official OpenAI web sources as the fallback path.

## Verification

- `codex mcp list`
- `codex mcp get openaiDeveloperDocs`
- `sed -n '1,220p' AGENTS.md`
- `sed -n '1,220p' docs/tasks/TASK-0050-openai-docs-mcp.md`

## Smoke Test Attempt 2026-03-25

- Launched the VS Code Agent-mode smoke-test prompt through the supported Windows CLI path with `code.cmd chat -m agent -r --maximize`.
- Verified that VS Code loaded the OpenAI Docs MCP tool schema `vscode://schemas/lm/tool/mcp_openaidevelop_search_openai_docs`.
- Verified that GitHub Copilot Chat executed the agent request successfully in `panel/editAgent`.
- Recovered a clean transcript artifact for request `0` from the ClaRTK workspace session store:
  `docs/operations/openai-docs-mcp-smoke-test-2026-03-25-transcript.md`
- The later `Developer: Reload Window` contamination remains present as a separate request in the same session file, but the extracted transcript artifact preserves the original smoke-test prompt and answer cleanly.
- No tools-picker screenshot showing `openaiDeveloperDocs` enabled was captured.
- Follow-on record: `docs/operations/openai-docs-mcp-smoke-test-2026-03-25.md`

## Notes

- VS Code Copilot Chat in Agent mode still requires enabling `openaiDeveloperDocs` in the tools picker for the session.
- Treat the smoke test as `retry required` until a tools-picker artifact is captured and linked together with the recorded transcript artifact.
