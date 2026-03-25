# OpenAI Docs MCP Smoke Test Attempt 2026-03-25

- Status: retry required for tools-picker screenshot only
- Date: 2026-03-25
- Owner: initial agent
- Scope: verify that `openaiDeveloperDocs` is active in VS Code Copilot Chat Agent mode and capture a clean transcript plus a tools-picker artifact

## Attempt Summary

- The smoke-test prompt was launched in VS Code Agent mode from the ClaRTK workspace using the supported Windows CLI path.
- VS Code loaded the OpenAI Docs MCP search-tool schema during the session.
- GitHub Copilot Chat completed the related agent request.
- The original UI attempt was later contaminated by desktop automation that injected `Developer: Reload Window` into the active chat.
- A clean transcript artifact was later recovered from the Windows VS Code workspace session store for the ClaRTK workspace.

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
- Clean transcript artifact:
  `docs/operations/openai-docs-mcp-smoke-test-2026-03-25-transcript.md`
  extracts request `0` from the ClaRTK workspace session JSONL at
  `/mnt/c/Users/cyber/AppData/Roaming/Code/User/workspaceStorage/6ce9276ac101848fdfb7ca9ae2149cb9/chatSessions/bfe364ba-8b10-4b15-b8f5-dc00459e4023.jsonl`.
  That request records the original prompt, `openaiDeveloperDocs` MCP tool calls, and the final answer.

## Why This Is Not Yet A Pass

- The clean smoke-test prompt and answer are now preserved as a readable transcript artifact.
- The required screenshot showing `openaiDeveloperDocs` enabled in the VS Code tools picker was not captured.
- Because that screenshot artifact is still missing, this attempt must not be treated as a final smoke-test pass.

## Retry Exit Criteria

- Keep the captured transcript artifact as the canonical prompt-and-answer record for this smoke test.
- Capture a screenshot showing `openaiDeveloperDocs` enabled in the VS Code Copilot Chat tools picker.
- Confirm the screenshot is linked together with the transcript artifact from `docs/operations/openai-docs-mcp-smoke-test-2026-03-25-transcript.md`.
- Link the final artifact set back into `docs/tasks/TASK-0050-openai-docs-mcp.md`.
