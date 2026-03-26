import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import type {
  AgentRunCollection,
  AgentRunDetail,
  AgentTaskCollection,
  AgentTaskRecord,
  AuthenticatedMe,
  DevConsoleApiHealth,
  DevPreferenceProfile,
  DevPreferenceSignal,
  DocsCatalogItem,
  DocsCatalogResponse,
  EvaluationResultRecord,
  JsonObject,
  KnowledgeClaimRecord,
  ResourceCollection,
  ServiceStatus,
  SkillCatalogResponse,
  SkillDescriptor,
  SourceDocumentRecord,
  WorkspaceOverview,
  WorkspaceServiceHealth
} from "@clartk/domain";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

const config = {
  host: process.env.CLARTK_DEV_CONSOLE_API_HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? process.env.CLARTK_DEV_CONSOLE_API_PORT ?? "3300"),
  runtimeApiBaseUrl: process.env.CLARTK_RUNTIME_API_BASE_URL ?? "http://localhost:3000",
  agentMemoryBaseUrl: process.env.CLARTK_AGENT_MEMORY_BASE_URL ?? "http://localhost:3100",
  gatewayDiagnosticsBaseUrl:
    process.env.CLARTK_GATEWAY_DIAGNOSTICS_BASE_URL ?? "http://localhost:3200",
  devConsoleOrigin: process.env.CLARTK_DEV_CONSOLE_ORIGIN ?? "http://localhost:5180",
  agentMemoryInternalToken: process.env.CLARTK_AGENT_MEMORY_REVIEW_TOKEN ?? "dev-review-token",
  backupDir: path.resolve(repoRoot, process.env.CLARTK_DB_BACKUP_DIR ?? ".clartk/dev/backups"),
  resolvedEnvPath: path.resolve(repoRoot, ".clartk/dev/resolved.env")
};

const allowedTaskKinds = new Set([
  "memory.run_embeddings",
  "memory.run_evaluations",
  "preferences.compute_dev_preference_scores",
  "catalog.refresh_doc_catalog",
  "catalog.refresh_skill_catalog"
]);

const app = Fastify({ logger: true });

class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

app.addHook("onRequest", async (request, reply) => {
  const origin = request.headers.origin;
  if (origin && origin === config.devConsoleOrigin) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Access-Control-Allow-Headers", "authorization, content-type");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    reply.header("Vary", "Origin");
  }
});

app.options("/health", async (_request, reply) => {
  reply.code(204).send();
});

app.options("/v1/:rest*", async (_request, reply) => {
  reply.code(204).send();
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ApiError) {
    reply.status(error.statusCode).send({ error: error.message });
    return;
  }

  app.log.error(error);
  reply.status(500).send({ error: "internal server error" });
});

app.get("/health", async (): Promise<DevConsoleApiHealth> => ({
  service: "dev-console-api",
  status: "ok",
  workspace: "clartk",
  runtimeApiBaseUrl: config.runtimeApiBaseUrl,
  agentMemoryBaseUrl: config.agentMemoryBaseUrl
}));

app.get("/v1/workspace/overview", async (request): Promise<WorkspaceOverview> => {
  await requireAdmin(request.headers);
  return buildWorkspaceOverview();
});

app.get("/v1/coordination/tasks", async (request): Promise<AgentTaskCollection> => {
  await requireAdmin(request.headers);
  const query = request.query as Record<string, string | undefined>;
  const suffix = query.queueName ? `?queueName=${encodeURIComponent(query.queueName)}` : "";
  return agentMemoryInternalRequest<AgentTaskCollection>(`/v1/internal/coordination/tasks${suffix}`);
});

app.get("/v1/coordination/tasks/:taskId", async (request): Promise<AgentTaskRecord> => {
  await requireAdmin(request.headers);
  const taskId = requireInteger((request.params as Record<string, unknown>).taskId, "taskId");
  return agentMemoryInternalRequest<AgentTaskRecord>(`/v1/internal/coordination/tasks/${taskId}`);
});

app.post("/v1/coordination/tasks/enqueue", async (request): Promise<AgentTaskRecord> => {
  await requireAdmin(request.headers);
  const body = asBody(request.body);
  const taskKind = requireString(body.taskKind, "taskKind");
  if (!allowedTaskKinds.has(taskKind)) {
    throw new ApiError(409, `unsupported task kind: ${taskKind}`);
  }

  return agentMemoryInternalRequest<AgentTaskRecord>("/v1/internal/coordination/tasks", {
    method: "POST",
    body: {
      taskKind,
      queueName: typeof body.queueName === "string" ? body.queueName : "default",
      priority: typeof body.priority === "number" ? body.priority : 0,
      payload: ensureJsonObject(body.payload)
    }
  });
});

app.post("/v1/coordination/tasks/:taskId/retry", async (request): Promise<AgentTaskRecord> => {
  await requireAdmin(request.headers);
  const taskId = requireInteger((request.params as Record<string, unknown>).taskId, "taskId");
  const body = asBody(request.body);
  return agentMemoryInternalRequest<AgentTaskRecord>(`/v1/internal/coordination/tasks/${taskId}/retry`, {
    method: "POST",
    body: {
      note: typeof body.note === "string" ? body.note : undefined
    }
  });
});

app.get("/v1/coordination/runs", async (request): Promise<AgentRunCollection> => {
  await requireAdmin(request.headers);
  return agentMemoryInternalRequest<AgentRunCollection>("/v1/internal/coordination/runs");
});

app.get("/v1/coordination/runs/:runId", async (request): Promise<AgentRunDetail> => {
  await requireAdmin(request.headers);
  const runId = requireInteger((request.params as Record<string, unknown>).runId, "runId");
  return agentMemoryInternalRequest<AgentRunDetail>(`/v1/internal/coordination/runs/${runId}`);
});

app.get(
  "/v1/knowledge/source-documents",
  async (request): Promise<ResourceCollection<SourceDocumentRecord>> => {
    await requireAdmin(request.headers);
    return agentMemoryPublicRequest<ResourceCollection<SourceDocumentRecord>>("/v1/source-documents");
  }
);

app.get("/v1/knowledge/claims", async (request): Promise<ResourceCollection<KnowledgeClaimRecord>> => {
  await requireAdmin(request.headers);
  return agentMemoryPublicRequest<ResourceCollection<KnowledgeClaimRecord>>("/v1/claims");
});

app.get("/v1/evaluations", async (request): Promise<ResourceCollection<EvaluationResultRecord>> => {
  await requireAdmin(request.headers);
  return agentMemoryPublicRequest<ResourceCollection<EvaluationResultRecord>>("/v1/evaluations");
});

app.get("/v1/docs/catalog", async (request): Promise<DocsCatalogResponse> => {
  await requireAdmin(request.headers);
  return buildDocsCatalog();
});

app.get("/v1/skills", async (request): Promise<SkillCatalogResponse> => {
  await requireAdmin(request.headers);
  return buildSkillsCatalog();
});

app.get("/v1/preferences/runtime-profile-summary", async (request): Promise<AuthenticatedMe> => {
  return requireAdmin(request.headers);
});

app.get("/v1/preferences/dev-profile", async (request): Promise<DevPreferenceProfile> => {
  const me = await requireAdmin(request.headers);
  return agentMemoryInternalRequest<DevPreferenceProfile>(
    `/v1/internal/preferences/dev-profile?runtimeAccountId=${encodeURIComponent(me.account.accountId)}`
  );
});

app.post("/v1/preferences/signals", async (request): Promise<DevPreferenceSignal> => {
  const me = await requireAdmin(request.headers);
  const body = asBody(request.body);
  return agentMemoryInternalRequest<DevPreferenceSignal>("/v1/internal/preferences/dev-signals", {
    method: "POST",
    body: {
      runtimeAccountId: me.account.accountId,
      signalKind: requireString(body.signalKind, "signalKind"),
      surface: typeof body.surface === "string" ? body.surface : "dev_console",
      panelKey: typeof body.panelKey === "string" ? body.panelKey : undefined,
      payload: ensureJsonObject(body.payload)
    }
  });
});

app.post("/v1/preferences/decisions", async (request): Promise<DevPreferenceProfile> => {
  const me = await requireAdmin(request.headers);
  const body = asBody(request.body);
  await agentMemoryInternalRequest("/v1/internal/preferences/dev-decisions", {
    method: "POST",
    body: {
      runtimeAccountId: me.account.accountId,
      devPreferenceSignalId:
        typeof body.devPreferenceSignalId === "number" ? body.devPreferenceSignalId : undefined,
      decisionKind: requireString(body.decisionKind, "decisionKind"),
      subjectKind: requireString(body.subjectKind, "subjectKind"),
      subjectKey: requireString(body.subjectKey, "subjectKey"),
      chosenValue: typeof body.chosenValue === "string" ? body.chosenValue : undefined,
      payload: ensureJsonObject(body.payload)
    }
  });

  return agentMemoryInternalRequest<DevPreferenceProfile>(
    `/v1/internal/preferences/dev-profile?runtimeAccountId=${encodeURIComponent(me.account.accountId)}`
  );
});

async function requireAdmin(headers: Record<string, string | string[] | undefined>): Promise<AuthenticatedMe> {
  const me = await runtimeRequest<AuthenticatedMe>("/v1/me", {
    method: "GET",
    headers: forwardedAuthHeaders(headers)
  });
  if (me.account.role !== "admin") {
    throw new ApiError(403, "development interface requires admin role");
  }
  return me;
}

function forwardedAuthHeaders(headers: Record<string, string | string[] | undefined>): HeadersInit {
  const result: Record<string, string> = {};
  const cookie = headers.cookie;
  const authorization = headers.authorization;
  if (typeof cookie === "string" && cookie) {
    result.cookie = cookie;
  }
  if (typeof authorization === "string" && authorization) {
    result.authorization = authorization;
  }
  return result;
}

async function runtimeRequest<T>(
  pathOrUrl: string,
  init: {
    method: string;
    headers?: HeadersInit;
    body?: unknown;
  }
): Promise<T> {
  return requestJson<T>(new URL(pathOrUrl, config.runtimeApiBaseUrl).toString(), init);
}

async function agentMemoryPublicRequest<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
  } = {}
): Promise<T> {
  return requestJson<T>(new URL(path, config.agentMemoryBaseUrl).toString(), {
    method: init.method ?? "GET",
    body: init.body
  });
}

async function agentMemoryInternalRequest<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
  } = {}
): Promise<T> {
  return requestJson<T>(new URL(path, config.agentMemoryBaseUrl).toString(), {
    method: init.method ?? "GET",
    headers: {
      "X-Clartk-Review-Token": config.agentMemoryInternalToken
    },
    body: init.body
  });
}

async function requestJson<T>(
  url: string,
  init: {
    method: string;
    headers?: HeadersInit;
    body?: unknown;
  }
): Promise<T> {
  const response = await fetch(url, {
    method: init.method,
    headers: {
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...init.headers
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });

  if (!response.ok) {
    const detail = await safeErrorDetail(response);
    throw new ApiError(response.status, `request failed for ${url}:${detail ? ` ${detail}` : ""}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function safeErrorDetail(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? "";
  } catch {
    return "";
  }
}

async function buildWorkspaceOverview(): Promise<WorkspaceOverview> {
  const resolvedEnv = await loadResolvedEnv();
  const postgresHost = resolvedEnv.CLARTK_RESOLVED_POSTGRES_HOST ?? process.env.CLARTK_POSTGRES_HOST ?? "127.0.0.1";
  const postgresPort = Number(
    resolvedEnv.CLARTK_RESOLVED_POSTGRES_PORT ?? process.env.CLARTK_POSTGRES_PORT ?? "5432"
  );
  const postgresSource = resolvedEnv.CLARTK_RESOLVED_POSTGRES_SOURCE ?? "configured_env";
  const postgresReachable = await tcpReachable(postgresHost, postgresPort);

  const services = await Promise.all([
    probeService("api", `${config.runtimeApiBaseUrl}/health`),
    probeService("agent-memory", `${config.agentMemoryBaseUrl}/health`),
    probeService("gateway", `${config.gatewayDiagnosticsBaseUrl}/health`)
  ]);
  const status: ServiceStatus =
    postgresReachable && services.every((service: WorkspaceServiceHealth) => service.status === "ok")
      ? "ok"
      : "degraded";

  return {
    status,
    postgres: {
      host: postgresHost,
      port: postgresPort,
      source: postgresSource,
      reachable: postgresReachable
    },
    backup: await latestBackupSummary(),
    services
  };
}

async function probeService(service: string, url: string): Promise<WorkspaceServiceHealth> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        service,
        status: "degraded",
        url,
        detail: { error: `http ${response.status}` }
      };
    }
    const detail = (await response.json()) as JsonObject;
    const status = detail.status === "ok" ? "ok" : "degraded";
    return {
      service,
      status,
      url,
      detail
    };
  } catch (error) {
    return {
      service,
      status: "degraded",
      url,
      detail: {
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

async function loadResolvedEnv(): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(config.resolvedEnvPath, "utf8");
    return parseEnvFile(content);
  } catch {
    return {};
  }
}

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    result[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }
  return result;
}

async function latestBackupSummary(): Promise<WorkspaceOverview["backup"]> {
  try {
    const entries = await fs.readdir(config.backupDir, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
    const latest = directories[0];
    if (!latest) {
      return null;
    }
    const latestDir = path.join(config.backupDir, latest);
    let createdAt: string | null = null;
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(latestDir, "manifest.json"), "utf8")) as {
        timestampUtc?: string;
      };
      createdAt = typeof manifest.timestampUtc === "string" ? manifest.timestampUtc : null;
    } catch {
      createdAt = null;
    }
    let latestBackupKind: "logical" | "logical+volume" = "logical";
    try {
      await fs.access(path.join(latestDir, "postgres-volume.tar"));
      latestBackupKind = "logical+volume";
    } catch {
      latestBackupKind = "logical";
    }
    return {
      latestBackupDir: latestDir,
      latestBackupKind,
      latestBackupCreatedAt: createdAt
    };
  } catch {
    return null;
  }
}

async function tcpReachable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1000);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
  });
}

async function buildDocsCatalog(): Promise<DocsCatalogResponse> {
  const docsRoot = path.join(repoRoot, "docs");
  const items: DocsCatalogItem[] = [];
  for (const markdownPath of await walkMarkdownFiles(docsRoot)) {
    const relativePath = path.relative(repoRoot, markdownPath).replaceAll(path.sep, "/");
    const content = await fs.readFile(markdownPath, "utf8");
    items.push({
      path: relativePath,
      title: extractTitle(content, path.basename(markdownPath, ".md")),
      kind: classifyDoc(relativePath),
      summary: extractSummary(content),
      updatedAt: (await fs.stat(markdownPath)).mtime.toISOString(),
      tags: buildDocTags(relativePath)
    });
  }

  const agentsPath = path.join(repoRoot, "AGENTS.md");
  try {
    const content = await fs.readFile(agentsPath, "utf8");
    items.unshift({
      path: "AGENTS.md",
      title: extractTitle(content, "AGENTS"),
      kind: "guide",
      summary: extractSummary(content),
      updatedAt: (await fs.stat(agentsPath)).mtime.toISOString(),
      tags: ["guide", "agent"]
    });
  } catch {
    // ignore missing AGENTS.md
  }

  return {
    items: items.sort((left, right) => left.path.localeCompare(right.path)),
    source: "filesystem"
  };
}

async function buildSkillsCatalog(): Promise<SkillCatalogResponse> {
  const items: SkillDescriptor[] = [];
  for (const sourceRoot of [
    { source: "repo" as const, root: path.join(repoRoot, ".agents", "skills") },
    { source: "system" as const, root: path.join(process.env.HOME ?? "", ".codex", "skills", ".system") }
  ]) {
    for (const skillPath of await walkNamedFiles(sourceRoot.root, "SKILL.md")) {
      const content = await fs.readFile(skillPath, "utf8");
      items.push({
        skillId: path.basename(path.dirname(skillPath)),
        name: extractFrontmatterValue(content, "name") ?? path.basename(path.dirname(skillPath)),
        description: extractFrontmatterValue(content, "description") ?? "",
        path: skillPath,
        source: sourceRoot.source,
        available: true
      });
    }
  }

  return {
    items: items.sort((left, right) => left.name.localeCompare(right.name)),
    source: "filesystem"
  };
}

async function walkMarkdownFiles(root: string): Promise<string[]> {
  return walkNamedFiles(root, ".md", true);
}

async function walkNamedFiles(root: string, suffix: string, suffixMatch = false): Promise<string[]> {
  const result: string[] = [];
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        result.push(...(await walkNamedFiles(fullPath, suffix, suffixMatch)));
        continue;
      }
      if ((suffixMatch && entry.name.endsWith(suffix)) || (!suffixMatch && entry.name === suffix)) {
        result.push(fullPath);
      }
    }
  } catch {
    return result;
  }
  return result;
}

function extractTitle(markdown: string, fallback: string): string {
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.slice(2).trim();
    }
  }
  return fallback;
}

function extractSummary(markdown: string): string {
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("- Status:")) {
      continue;
    }
    return trimmed;
  }
  return "";
}

function classifyDoc(relativePath: string): string {
  if (relativePath.startsWith("docs/tasks/")) {
    return "task";
  }
  if (relativePath.startsWith("docs/adr/")) {
    return "adr";
  }
  if (relativePath.startsWith("docs/operations/")) {
    return "operations";
  }
  if (relativePath.startsWith("docs/research/")) {
    return "research";
  }
  if (relativePath.startsWith("docs/plan/")) {
    return "plan";
  }
  return "guide";
}

function buildDocTags(relativePath: string): string[] {
  return [classifyDoc(relativePath)];
}

function extractFrontmatterValue(markdown: string, key: string): string | null {
  const match = markdown.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) {
    return null;
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function asBody(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function ensureJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${field} is required`);
  }
  return value.trim();
}

function requireInteger(value: unknown, field: string): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isInteger(numericValue)) {
    throw new ApiError(400, `${field} must be an integer`);
  }
  return numericValue;
}

app.listen({ host: config.host, port: config.port }).catch((error: unknown) => {
  app.log.error(error);
  process.exitCode = 1;
});
