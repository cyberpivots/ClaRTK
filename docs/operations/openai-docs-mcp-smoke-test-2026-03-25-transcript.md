# OpenAI Docs MCP Smoke Test Transcript Artifact 2026-03-25

- Status: clean transcript artifact captured
- Date: 2026-03-25
- Owner: initial agent
- Source session store:
  `/mnt/c/Users/cyber/AppData/Roaming/Code/User/workspaceStorage/6ce9276ac101848fdfb7ca9ae2149cb9/chatSessions/bfe364ba-8b10-4b15-b8f5-dc00459e4023.jsonl`
- Scope:
  preserve the exact ClaRTK workspace smoke-test prompt, the OpenAI Docs MCP tool activity, and the final answer from request `0`

## Why This Artifact Is Clean

- This artifact is extracted from request `0` of the ClaRTK workspace session and excludes the later `PDeveloper: Reload Window` request recorded separately in the same session file.
- The recorded tool calls are against `openaiDeveloperDocs (MCP Server)`, not a generic web fallback path.

## Prompt

`Look up the request schema for Responses API tools in the OpenAI developer docs and summarize the required fields.`

## MCP Tool Activity

- `mcp_openaidevelop_search_openai_docs`
  Input: `{"query":"Responses API tools request schema","limit":10}`
- `mcp_openaidevelop_fetch_openai_doc`
  Input: `{"url":"https://developers.openai.com/api/reference/resources/responses/methods/create/"}`
- `mcp_openaidevelop_search_openai_docs`
  Input: `{"query":"Responses API create tools parameter function type name parameters schema","limit":5}`
- `mcp_openaidevelop_list_api_endpoints`
  Input: `{"query":"responses"}`
- `mcp_openaidevelop_get_openapi_spec`
  Input: `{"url":"https://developers.openai.com/api/reference/resources/responses/methods/create/"}`
- `mcp_openaidevelop_get_openapi_spec`
  Input: `{"url":"https://api.openai.com/v1/responses"}`
- `mcp_openaidevelop_fetch_openai_doc`
  Input: `{"url":"https://developers.openai.com/api/docs/guides/function-calling"}`

## Final Answer

```md
Now I have all the detail needed. Here's the summary:

---

## Responses API - Tool Types and Required Fields

The `tools` parameter in a `POST /v1/responses` request is an array of tool objects. Each tool type has its own required schema:

### 1. Function tool (`type: "function"`)

| Field | Required | Description |
|---|---|---|
| `type` | **Yes** | Must be `"function"` |
| `name` | **Yes** | The function name (e.g. `"get_weather"`) |
| `description` | No | When and how to use the function |
| `parameters` | **Yes** | JSON Schema object defining the function's input arguments |
| `strict` | No | Whether to enforce strict schema adherence (recommended `true`) |

When `strict: true`, the `parameters` schema must set `additionalProperties: false` on every object and mark all properties as `required`.

### 2. Web search tool (`type: "web_search_preview"`)

| Field | Required | Description |
|---|---|---|
| `type` | **Yes** | Must be `"web_search_preview"` |
| `domains` | No | Array of domains to restrict results |
| `search_context_size` | No | `"low"`, `"medium"` (default), or `"high"` |
| `user_location` | No | Approximate location object (`country`, `city`, `region`, `timezone`) |

### 3. File search tool (`type: "file_search"`)

| Field | Required | Description |
|---|---|---|
| `type` | **Yes** | Must be `"file_search"` |
| `vector_store_ids` | **Yes** | Array of vector store IDs to search |
| `max_num_results` | No | Max results to return |
| `ranking_options` | No | Object with `ranker` and `score_threshold` |
| `filters` | No | Metadata filters for narrowing results |

### 4. Code interpreter tool (`type: "code_interpreter"`)

| Field | Required | Description |
|---|---|---|
| `type` | **Yes** | Must be `"code_interpreter"` |
| `container` | No | Container/sandbox configuration |

### 5. MCP tool (`type: "mcp"`)

| Field | Required | Description |
|---|---|---|
| `type` | **Yes** | Must be `"mcp"` |
| `server_url` | **Yes** | The MCP server's HTTP endpoint |
| `headers` | No | Auth headers sent with every MCP request |
| `allowed_tools` | No | Subset of server tools to expose |
| `require_approval` | No | Whether tool calls need explicit approval (default: `true`) |

### 6. Namespace (`type: "namespace"`)

| Field | Required | Description |
|---|---|---|
| `type` | **Yes** | Must be `"namespace"` |
| `name` | **Yes** | Namespace identifier (e.g. `"crm"`) |
| `description` | No | When to use this group of tools |
| `tools` | **Yes** | Array of nested function tool definitions |

---

**Top-level required fields** for the `POST /v1/responses` request body itself are just `model` (string) and `input` (string or array of input items). The `tools` array is optional - omit it for plain text generation.
```

## Notes

- This transcript proves that the ClaRTK workspace smoke-test session used `openaiDeveloperDocs` MCP calls directly.
- This artifact does not replace the still-missing tools-picker screenshot required for a full smoke-test pass.
