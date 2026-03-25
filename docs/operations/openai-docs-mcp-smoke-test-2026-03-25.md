# OpenAI Docs MCP Smoke Test Attempt 2026-03-25

- Status: retry required
- Date: 2026-03-25
- Owner: initial agent
- Scope: verify that `openaiDeveloperDocs` is active in VS Code Copilot Chat Agent mode and capture a clean transcript plus a tools-picker artifact

## Attempt Summary

- The smoke-test prompt was launched in VS Code Agent mode from the ClaRTK workspace using the supported Windows CLI path.
- VS Code loaded the OpenAI Docs MCP search-tool schema during the session.
- GitHub Copilot Chat completed the related agent request.
- The session was later contaminated by desktop automation that injected `Developer: Reload Window` into the active chat, so the artifact set is incomplete.

## Verified Evidence

- MCP tool schema load:
  `/home/cyber/.vscode-server/data/logs/20260325T092211/exthost1/vscode.json-language-features/JSON Language Server.log`
  line 1 records `vscode://schemas/lm/tool/mcp_openaidevelop_search_openai_docs`.
- Agent request execution:
  `/home/cyber/.vscode-server/data/logs/20260325T092211/exthost1/GitHub.copilot-chat/GitHub Copilot Chat.log`
  lines 95-99 record a successful `panel/editAgent` request and the follow-on wrapper request.
- Later tool-calling activity:
  the same Copilot log lines 145-152 record later successful `panel/editAgent` runs and `ToolCallingLoop` entries.
- Non-canonical UI capture:
  `C:\Users\cyber\AppData\Local\Temp\vscode-smoke.png`
  shows the relevant chat session title, but it is not a clean acceptance artifact because the visible response is from the accidental reload-window prompt.

## Why This Is Not Yet A Pass

- The clean smoke-test prompt and answer were not preserved as a readable transcript artifact.
- The required screenshot showing `openaiDeveloperDocs` enabled in the VS Code tools picker was not captured.
- Because those acceptance artifacts are missing, this attempt must not be treated as a final smoke-test pass.

## Retry Exit Criteria

- Capture a clean transcript containing the smoke-test prompt and the corresponding answer.
- Capture a screenshot showing `openaiDeveloperDocs` enabled in the VS Code Copilot Chat tools picker for the same session.
- Confirm the answer is docs-grounded and materially consistent with the current OpenAI Responses API documentation.
- Link the final artifacts back into `docs/tasks/TASK-0050-openai-docs-mcp.md`.
