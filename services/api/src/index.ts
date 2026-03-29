import * as crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import { Pool, type PoolClient } from "pg";
import { fileURLToPath } from "node:url";
import type {
  Account,
  AccountId,
  ApiToken,
  ApiTokenCreateResult,
  AuthRole,
  AuthSessionResult,
  AuthenticatedMe,
  EffectiveOperatorProfile,
  HardwareDeploymentRunCollection,
  HardwareDeploymentRunDetail,
  InventoryBuild,
  InventoryBuildCollection,
  JsonObject,
  MyViewsResponse,
  PreferenceObservation,
  PreferenceObservationResult,
  PreferenceSuggestion,
  PreferenceSuggestionCollection,
  ProfileDefaults,
  PublishedProfileChange,
  ResourceCollection,
  RuntimeApiHealth,
  RuntimeApiReadiness,
  RuntimeSessionState,
  RuntimeDevice,
  RuntimePositionEvent,
  RuntimeRtkSolution,
  RuntimeSavedView,
  Session,
  SuggestionPublishResult,
  SuggestionReview,
  SuggestionReviewOutcome,
  ViewOverride
} from "@clartk/domain";
import { createDefaultProfileDefaults } from "@clartk/domain";

const { createHash, randomBytes, timingSafeEqual } = crypto;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const runtimeMigrationsDir = path.join(repoRoot, "db", "migrations");
const argon2Sync = (
  crypto as typeof crypto & {
    argon2Sync: (
      algorithm: "argon2d" | "argon2i" | "argon2id",
      options: {
        message: string | Buffer;
        nonce: Buffer;
        parallelism: number;
        tagLength: number;
        memory: number;
        passes: number;
      }
    ) => Buffer;
  }
).argon2Sync;

const config = {
  host: process.env.CLARTK_API_HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? process.env.CLARTK_API_PORT ?? "3000"),
  runtimeDatabaseUrl: process.env.CLARTK_RUNTIME_DATABASE_URL,
  runtimeDatabasePoolMax: Number(process.env.CLARTK_API_DB_POOL_MAX ?? "8"),
  runtimeDatabaseIdleTimeoutMs: Number(process.env.CLARTK_API_DB_IDLE_TIMEOUT_MS ?? "10000"),
  runtimeDatabaseConnectTimeoutMs: Number(process.env.CLARTK_API_DB_CONNECT_TIMEOUT_MS ?? "10000"),
  runtimeDatabaseSessionIdleTimeoutMs: Number(
    process.env.CLARTK_API_DB_SESSION_IDLE_TIMEOUT_MS ?? "60000"
  ),
  gatewayDiagnosticsBaseUrl:
    process.env.CLARTK_GATEWAY_DIAGNOSTICS_BASE_URL ?? "http://localhost:3200",
  agentMemoryBaseUrl: process.env.CLARTK_AGENT_MEMORY_BASE_URL ?? "http://localhost:3100",
  agentMemoryReviewToken: process.env.CLARTK_AGENT_MEMORY_REVIEW_TOKEN ?? "",
  dashboardOrigin: process.env.CLARTK_DASHBOARD_ORIGIN ?? "http://localhost:5173",
  devConsoleOrigin: process.env.CLARTK_DEV_CONSOLE_ORIGIN ?? "http://localhost:5180",
  sessionCookieName: process.env.CLARTK_SESSION_COOKIE_NAME ?? "clartk_session",
  sessionTtlHours: Number(process.env.CLARTK_SESSION_TTL_HOURS ?? "168"),
  secureCookies: process.env.CLARTK_SESSION_COOKIE_SECURE === "1"
};
const allowedBrowserOrigins = new Set([
  ...expandLoopbackOrigins(config.dashboardOrigin),
  ...expandLoopbackOrigins(config.devConsoleOrigin)
]);

const pool = config.runtimeDatabaseUrl
  ? new Pool({
      connectionString: config.runtimeDatabaseUrl,
      application_name: "clartk-runtime-api",
      max: clampPositiveInteger(config.runtimeDatabasePoolMax, 8),
      idleTimeoutMillis: clampPositiveInteger(config.runtimeDatabaseIdleTimeoutMs, 10000),
      connectionTimeoutMillis: clampPositiveInteger(config.runtimeDatabaseConnectTimeoutMs, 10000),
      options: `-c idle_session_timeout=${clampPositiveInteger(
        config.runtimeDatabaseSessionIdleTimeoutMs,
        60000
      )}`
    })
  : null;

const app = Fastify({ logger: true });

class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

type DatabaseRow = Record<string, any>;

interface AuthContext {
  account: Account;
  session: Session | null;
  token: ApiToken | null;
}

interface AuthRecord {
  account: Account;
  session: Session | null;
  token: ApiToken | null;
}

interface AgentMemorySuggestionRecord {
  preferenceSuggestionId: number;
  runtimeAccountId: AccountId;
  suggestionKind: string;
  status: string;
  rationale: string;
  confidence: number | null;
  candidatePatch: JsonObject;
  evidence: unknown[];
  basedOnProfileVersion: number | null;
  signature: string;
  createdAt: string;
  updatedAt: string;
  publishedRuntimeChangeId: number | null;
  reviews: SuggestionReview[];
}

app.addHook("onRequest", async (request, reply) => {
  const origin = request.headers.origin;
  if (origin && allowedBrowserOrigins.has(origin)) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Access-Control-Allow-Headers", "authorization, content-type");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    reply.header("Vary", "Origin");
  }
});

app.options("*", async (_request, reply) => {
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

app.addHook("onClose", async () => {
  await pool?.end();
});

app.get("/health", async () => {
  const payload: RuntimeApiHealth = {
    service: "api",
    status: "ok",
    workspace: "clartk",
    contracts: "provisional",
    runtimeDatabaseConfigured: Boolean(config.runtimeDatabaseUrl),
    runtimeDatabaseName: "clartk_runtime",
    gatewayDiagnosticsBaseUrl: config.gatewayDiagnosticsBaseUrl,
    agentMemoryBaseUrl: config.agentMemoryBaseUrl
  };

  return payload;
});

app.get("/ready", async (_request, reply) => {
  const payload = await buildRuntimeApiReadiness();
  reply.code(payload.status === "ok" ? 200 : 503);
  return payload;
});

app.post("/v1/auth/bootstrap", async (request, reply) => {
  const body = asBody(request.body);
  const email = requireString(body.email, "email").toLowerCase();
  const password = requireString(body.password, "password");
  const displayName = requireString(body.displayName, "displayName");

  const result = await withRuntimeTransaction(async (client) => {
    const row = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM auth.account");
    if (Number(row.rows[0]?.count ?? "0") > 0) {
      throw new ApiError(409, "bootstrap account already exists");
    }

    const account = await createAccountRecord(client, {
      email,
      password,
      displayName,
      role: "admin"
    });
    const session = await createSessionRecord(client, account.accountId);
    return {
      account,
      session
    };
  });

  setSessionCookie(reply, result.session.cookieValue, result.session.session.expiresAt);
  reply.code(201);
  return buildAuthSessionResult(result.account, result.session.session, await loadProfile(result.account.accountId));
});

app.post("/v1/auth/login", async (request, reply) => {
  const body = asBody(request.body);
  const email = requireString(body.email, "email").toLowerCase();
  const password = requireString(body.password, "password");

  const result = await withRuntimeTransaction(async (client) => {
    const auth = await lookupLocalIdentity(client, email);
    if (!auth || !verifyPassword(password, String(auth.password_hash))) {
      throw new ApiError(401, "invalid email or password");
    }

    const account = mapAccountRow(auth);
    if (account.disabledAt) {
      throw new ApiError(403, "account is disabled");
    }

    const session = await createSessionRecord(client, account.accountId);
    return {
      account,
      session
    };
  });

  setSessionCookie(reply, result.session.cookieValue, result.session.session.expiresAt);
  return buildAuthSessionResult(result.account, result.session.session, await loadProfile(result.account.accountId));
});

app.post("/v1/auth/logout", async (request, reply) => {
  const cookieValue = parseCookies(request.headers.cookie)[config.sessionCookieName];
  if (cookieValue) {
    const parsed = parseOpaqueCredential(cookieValue);
    if (parsed) {
      await withRuntimeClient(async (client) => {
        await client.query(
          "UPDATE auth.session SET revoked_at = NOW() WHERE session_id = $1 AND revoked_at IS NULL",
          [parsed.id]
        );
      });
    }
  }

  clearSessionCookie(reply);
  reply.code(204);
  return reply.send();
});

app.get("/v1/auth/session", async (request): Promise<RuntimeSessionState> => {
  try {
    const auth = await requireAuth(request);
    return {
      authenticated: true,
      me: await loadAuthenticatedMe(auth.account.accountId, auth.session)
    };
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) {
      return {
        authenticated: false,
        me: null
      };
    }
    throw error;
  }
});

app.get("/v1/me", async (request) => {
  const auth = await requireAuth(request);
  return loadAuthenticatedMe(auth.account.accountId, auth.session);
});

app.post("/v1/auth/tokens", async (request, reply) => {
  const auth = await requireAuth(request);
  const body = asBody(request.body);
  const label = requireString(body.label, "label");

  const result = await withRuntimeTransaction(async (client) => {
    const token = await createApiTokenRecord(client, auth.account.accountId, label);
    return token;
  });

  reply.code(201);
  return result;
});

app.delete("/v1/auth/tokens/:tokenId", async (request, reply) => {
  const auth = await requireAuth(request);
  const tokenId = requireString((request.params as Record<string, unknown>).tokenId, "tokenId");

  await withRuntimeClient(async (client) => {
    await client.query(
      `
      UPDATE auth.api_token
      SET revoked_at = NOW()
      WHERE token_id = $1 AND account_id = $2 AND revoked_at IS NULL
      `,
      [tokenId, auth.account.accountId]
    );
  });

  reply.code(204);
  return reply.send();
});

app.get("/v1/me/profile", async (request) => {
  const auth = await requireAuth(request);
  const query = (request.query as Record<string, unknown>) ?? {};
  const viewId = query.viewId === undefined ? null : Number.parseInt(String(query.viewId), 10);
  return loadEffectiveProfile(auth.account.accountId, Number.isNaN(viewId ?? NaN) ? null : viewId);
});

app.patch("/v1/me/profile", async (request) => {
  const auth = await requireAuth(request);
  const body = asBody(request.body);
  const defaultsPatch = requireJsonObject(body.defaultsPatch, "defaultsPatch");

  const result = await withRuntimeTransaction(async (client) => {
    const profile = await loadOrCreateProfile(client, auth.account.accountId);
    const mergedDefaults = normalizeProfileDefaults(
      deepMergeJsonObject(profile.defaults as unknown as JsonObject, defaultsPatch)
    );
    const updated = await upsertProfile(client, auth.account.accountId, mergedDefaults, auth.account.accountId);
    const change = await insertProfileChange(client, {
      accountId: auth.account.accountId,
      actorAccountId: auth.account.accountId,
      sourceKind: "explicit_update",
      suggestionId: null,
      profileVersion: updated.version,
      changePayload: defaultsPatch
    });

    return {
      profile: updated,
      change
    };
  });

  await recordRuntimePreferenceObservation(auth.account, {
    eventKind: "profile_defaults_updated",
    signature: `profile:${stableJsonStringify(defaultsPatch)}`,
    suggestionKind: "profile_defaults",
    candidatePatch: defaultsPatch,
    payload: { source: "explicit_update" },
    basedOnProfileVersion: result.profile.version
  });

  return loadEffectiveProfile(auth.account.accountId, null);
});

app.get("/v1/me/views", async (request) => {
  const auth = await requireAuth(request);
  return loadMyViews(auth.account.accountId);
});

app.post("/v1/me/views", async (request, reply) => {
  const auth = await requireAuth(request);
  const body = asBody(request.body);
  const name = requireString(body.name, "name");
  const contextKey = optionalString(body.contextKey);
  const layout = optionalJsonObject(body.layout);
  const overridePayload = optionalJsonObject(body.overridePayload);

  const view = await withRuntimeTransaction(async (client) => {
    const row = await client.query(
      `
      INSERT INTO ui.saved_view (name, layout, owner_account_id, scope_kind, context_key, override_payload)
      VALUES ($1, $2, $3, 'account_override', $4, $5)
      RETURNING saved_view_id, name, layout, owner_account_id, scope_kind, context_key, override_payload, created_at
      `,
      [name, layout, auth.account.accountId, contextKey, overridePayload]
    );
    return mapViewOverrideRow(row.rows[0]);
  });

  await recordRuntimePreferenceObservation(auth.account, {
    eventKind: "view_override_saved",
    signature: `view:${contextKey ?? "default"}:${stableJsonStringify(overridePayload)}`,
    suggestionKind: "view_override",
    candidatePatch: overridePayload,
    payload: {
      contextKey,
      savedViewId: view.savedViewId
    }
  });

  reply.code(201);
  return view;
});

app.patch("/v1/me/views/:savedViewId", async (request) => {
  const auth = await requireAuth(request);
  const body = asBody(request.body);
  const savedViewId = Number.parseInt(
    requireString((request.params as Record<string, unknown>).savedViewId, "savedViewId"),
    10
  );

  if (Number.isNaN(savedViewId)) {
    throw new ApiError(400, "savedViewId must be a number");
  }

  const name = optionalString(body.name);
  const contextKey = body.contextKey === undefined ? undefined : optionalString(body.contextKey);
  const layout = body.layout === undefined ? undefined : optionalJsonObject(body.layout);
  const overridePayload =
    body.overridePayload === undefined ? undefined : optionalJsonObject(body.overridePayload);

  const view = await withRuntimeTransaction(async (client) => {
    const existingResult = await client.query(
      `
      SELECT saved_view_id, name, layout, owner_account_id, scope_kind, context_key, override_payload, created_at
      FROM ui.saved_view
      WHERE saved_view_id = $1
      `,
      [savedViewId]
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      throw new ApiError(404, "view override not found");
    }
    if (String(existing.owner_account_id ?? "") !== auth.account.accountId) {
      throw new ApiError(403, "view override does not belong to the current account");
    }

    const row = await client.query(
      `
      UPDATE ui.saved_view
      SET
        name = COALESCE($2, name),
        layout = COALESCE($3, layout),
        context_key = CASE WHEN $4::text IS NULL THEN context_key ELSE $4 END,
        override_payload = COALESCE($5, override_payload)
      WHERE saved_view_id = $1
      RETURNING saved_view_id, name, layout, owner_account_id, scope_kind, context_key, override_payload, created_at
      `,
      [savedViewId, name, layout, contextKey ?? null, overridePayload]
    );
    return mapViewOverrideRow(row.rows[0]);
  });

  await recordRuntimePreferenceObservation(auth.account, {
    eventKind: "view_override_updated",
    signature: `view:${view.savedViewId}:${stableJsonStringify(view.overridePayload)}`,
    suggestionKind: "view_override",
    candidatePatch: view.overridePayload,
    payload: {
      contextKey: view.contextKey,
      savedViewId: view.savedViewId
    }
  });

  return view;
});

app.post("/v1/me/preference-observations", async (request) => {
  const auth = await requireAuth(request);
  const body = asBody(request.body);
  const result = await recordRuntimePreferenceObservation(auth.account, {
    eventKind: requireString(body.eventKind, "eventKind"),
    signature: requireString(body.signature, "signature"),
    suggestionKind: requireString(body.suggestionKind, "suggestionKind"),
    candidatePatch: optionalJsonObject(body.candidatePatch),
    payload: optionalJsonObject(body.payload),
    basedOnProfileVersion:
      body.basedOnProfileVersion === undefined ? undefined : Number(body.basedOnProfileVersion)
  });

  return result;
});

app.get("/v1/me/suggestions", async (request) => {
  const auth = await requireAuth(request);
  const query = (request.query as Record<string, unknown>) ?? {};
  const requestedAccountId = optionalString(query.accountId);
  const targetAccountId = resolveTargetAccountId(auth, requestedAccountId);
  return listSuggestionsFromAgentMemory(targetAccountId);
});

app.post("/v1/me/suggestions/:suggestionId/review", async (request) => {
  const auth = await requireAuth(request);
  const body = asBody(request.body);
  const suggestionId = Number.parseInt(
    requireString((request.params as Record<string, unknown>).suggestionId, "suggestionId"),
    10
  );
  if (Number.isNaN(suggestionId)) {
    throw new ApiError(400, "suggestionId must be a number");
  }

  const targetAccountId = resolveTargetAccountId(auth, optionalString(body.accountId));
  const suggestion = await getSuggestionFromAgentMemory(suggestionId);
  if (!suggestion || suggestion.runtimeAccountId !== targetAccountId) {
    throw new ApiError(404, "suggestion not found");
  }

  return reviewSuggestionInAgentMemory(suggestionId, {
    reviewerRuntimeAccountId: auth.account.accountId,
    reviewerRole: auth.account.role,
    outcome: normalizeReviewOutcome(body.outcome),
    notes: optionalString(body.notes)
  });
});

app.post("/v1/me/suggestions/:suggestionId/publish", async (request) => {
  const auth = await requireAuth(request);
  const body = asBody(request.body);
  const suggestionId = Number.parseInt(
    requireString((request.params as Record<string, unknown>).suggestionId, "suggestionId"),
    10
  );
  if (Number.isNaN(suggestionId)) {
    throw new ApiError(400, "suggestionId must be a number");
  }

  const targetAccountId = resolveTargetAccountId(auth, optionalString(body.accountId));
  const suggestion = await getSuggestionFromAgentMemory(suggestionId);
  if (!suggestion || suggestion.runtimeAccountId !== targetAccountId) {
    throw new ApiError(404, "suggestion not found");
  }
  if (suggestion.status !== "approved") {
    throw new ApiError(409, "suggestion must be approved before publishing");
  }

  const publishResult = await withRuntimeTransaction(async (client) => {
    const profile = await loadOrCreateProfile(client, targetAccountId);
    if (
      suggestion.basedOnProfileVersion !== null &&
      suggestion.basedOnProfileVersion !== undefined &&
      suggestion.basedOnProfileVersion !== profile.version
    ) {
      throw new ApiError(409, "suggestion is based on a stale profile version");
    }

    const mergedDefaults = normalizeProfileDefaults(
      deepMergeJsonObject(profile.defaults as unknown as JsonObject, suggestion.candidatePatch)
    );
    const updated = await upsertProfile(client, targetAccountId, mergedDefaults, auth.account.accountId);
    const publishedChange = await insertProfileChange(client, {
      accountId: targetAccountId,
      actorAccountId: auth.account.accountId,
      sourceKind: "suggestion_publish",
      suggestionId,
      profileVersion: updated.version,
      changePayload: suggestion.candidatePatch
    });

    return {
      profile: updated,
      publishedChange
    };
  });

  const publishedSuggestion = await markSuggestionPublishedInAgentMemory(suggestionId, {
    runtimeProfileChangeId: publishResult.publishedChange.profileChangeId,
    publishedByRuntimeAccountId: auth.account.accountId,
    result: {
      profileVersion: publishResult.profile.version
    }
  });

  const effectiveProfile = await loadEffectiveProfile(targetAccountId, null);

  const response: SuggestionPublishResult = {
    profile: publishResult.profile,
    effectiveProfile,
    publishedChange: publishResult.publishedChange,
    suggestion: publishedSuggestion
  };
  return response;
});

app.get("/v1/hardware/builds", async (request): Promise<InventoryBuildCollection> => {
  await requireAuth(request);
  const query = (request.query as Record<string, unknown>) ?? {};
  const params = new URLSearchParams();
  const status = optionalString(query.status);
  const buildKind = optionalString(query.buildKind);
  if (status) {
    params.set("status", status);
  }
  if (buildKind) {
    params.set("buildKind", buildKind);
  }
  if (query.limit !== undefined) {
    params.set("limit", String(normalizePositiveInteger(query.limit, 20)));
  }
  const suffix = params.toString();
  const path = suffix ? `/v1/internal/inventory/builds?${suffix}` : "/v1/internal/inventory/builds";
  return agentMemoryRequest<InventoryBuildCollection>(path, {
    method: "GET"
  });
});

app.get("/v1/hardware/builds/:buildId", async (request): Promise<InventoryBuild> => {
  await requireAuth(request);
  const buildId = requirePositiveInteger(
    (request.params as Record<string, unknown>).buildId,
    "buildId"
  );
  return agentMemoryRequest<InventoryBuild>(`/v1/internal/inventory/builds/${buildId}`, {
    method: "GET"
  });
});

app.get("/v1/hardware/deployments", async (request): Promise<HardwareDeploymentRunCollection> => {
  await requireAuth(request);
  const query = (request.query as Record<string, unknown>) ?? {};
  const params = new URLSearchParams();
  if (query.buildId !== undefined) {
    params.set("buildId", String(requirePositiveInteger(query.buildId, "buildId")));
  }
  if (query.limit !== undefined) {
    params.set("limit", String(normalizePositiveInteger(query.limit, 20)));
  }
  const suffix = params.toString();
  const path = suffix
    ? `/v1/internal/inventory/deployments?${suffix}`
    : "/v1/internal/inventory/deployments";
  return agentMemoryRequest<HardwareDeploymentRunCollection>(path, {
    method: "GET"
  });
});

app.get(
  "/v1/hardware/deployments/:deploymentRunId",
  async (request): Promise<HardwareDeploymentRunDetail> => {
    await requireAuth(request);
    const deploymentRunId = requirePositiveInteger(
      (request.params as Record<string, unknown>).deploymentRunId,
      "deploymentRunId"
    );
    return agentMemoryRequest<HardwareDeploymentRunDetail>(
      `/v1/internal/inventory/deployments/${deploymentRunId}`,
      {
        method: "GET"
      }
    );
  }
);

app.get("/v1/admin/accounts", async (request) => {
  const auth = await requireAuth(request);
  requireAdmin(auth);
  return withRuntimeClient(async (client) => {
    const result = await client.query(
      `
      SELECT account_id, email, display_name, role, default_provider_kind, created_at, disabled_at
      FROM auth.account
      ORDER BY created_at ASC
      `
    );
    const payload: ResourceCollection<Account> = {
      items: result.rows.map(mapAccountRow),
      source: "database"
    };
    return payload;
  });
});

app.post("/v1/admin/accounts", async (request, reply) => {
  const auth = await requireAuth(request);
  requireAdmin(auth);
  const body = asBody(request.body);
  const account = await withRuntimeTransaction(async (client) =>
    createAccountRecord(client, {
      email: requireString(body.email, "email").toLowerCase(),
      password: requireString(body.password, "password"),
      displayName: requireString(body.displayName, "displayName"),
      role: normalizeRole(body.role)
    })
  );
  reply.code(201);
  return account;
});

app.get("/v1/devices", async (request) => {
  await requireAuth(request);
  const query = (request.query as Record<string, unknown>) ?? {};
  const hardwareFamily = optionalString(query.hardwareFamily);
  const createdBefore = optionalTimestamp(query.createdBefore, "createdBefore");
  const limit = normalizeListLimit(query.limit, 50);

  return withRuntimeClient(async (client) => {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (hardwareFamily) {
      values.push(hardwareFamily);
      clauses.push(`hardware_family = $${values.length}`);
    }
    if (createdBefore) {
      values.push(createdBefore);
      clauses.push(`created_at < $${values.length}`);
    }

    values.push(limit);
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await client.query(
      `
      SELECT device_id, external_id, hardware_family, firmware_version, config, created_at
      FROM device.registry
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${values.length}
      `,
      values
    );

    return {
      items: result.rows.map((row): RuntimeDevice => ({
        deviceId: String(row.device_id),
        externalId: String(row.external_id),
        hardwareFamily: String(row.hardware_family),
        firmwareVersion: row.firmware_version ? String(row.firmware_version) : null,
        config: asJsonObject(row.config),
        createdAt: toIsoString(row.created_at)
      })),
      source: "database"
    } satisfies ResourceCollection<RuntimeDevice>;
  });
});

app.get("/v1/telemetry/positions", async (request) => {
  await requireAuth(request);
  const query = (request.query as Record<string, unknown>) ?? {};
  const deviceId = optionalPositiveInteger(query.deviceId, "deviceId");
  const receivedAfter = optionalTimestamp(query.receivedAfter, "receivedAfter");
  const receivedBefore = optionalTimestamp(query.receivedBefore, "receivedBefore");
  const limit = normalizeListLimit(query.limit, 50);

  return withRuntimeClient(async (client) => {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (deviceId !== null) {
      values.push(deviceId);
      clauses.push(`device_id = $${values.length}`);
    }
    if (receivedAfter) {
      values.push(receivedAfter);
      clauses.push(`received_at >= $${values.length}`);
    }
    if (receivedBefore) {
      values.push(receivedBefore);
      clauses.push(`received_at < $${values.length}`);
    }

    values.push(limit);
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await client.query(
      `
      SELECT event_id, device_id, received_at, payload
      FROM telemetry.position_event
      ${whereClause}
      ORDER BY received_at DESC, event_id DESC
      LIMIT $${values.length}
      `,
      values
    );

    return {
      items: result.rows.map((row): RuntimePositionEvent => ({
        eventId: Number(row.event_id),
        deviceId: String(row.device_id),
        receivedAt: toIsoString(row.received_at),
        payload: asJsonObject(row.payload)
      })),
      source: "database"
    } satisfies ResourceCollection<RuntimePositionEvent>;
  });
});

app.get("/v1/rtk/solutions", async (request) => {
  await requireAuth(request);
  const query = (request.query as Record<string, unknown>) ?? {};
  const deviceId = optionalPositiveInteger(query.deviceId, "deviceId");
  const observedAfter = optionalTimestamp(query.observedAfter, "observedAfter");
  const observedBefore = optionalTimestamp(query.observedBefore, "observedBefore");
  const quality = optionalString(query.quality);
  const limit = normalizeListLimit(query.limit, 50);

  return withRuntimeClient(async (client) => {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (deviceId !== null) {
      values.push(deviceId);
      clauses.push(`device_id = $${values.length}`);
    }
    if (observedAfter) {
      values.push(observedAfter);
      clauses.push(`observed_at >= $${values.length}`);
    }
    if (observedBefore) {
      values.push(observedBefore);
      clauses.push(`observed_at < $${values.length}`);
    }
    if (quality) {
      values.push(quality);
      clauses.push(`quality = $${values.length}`);
    }

    values.push(limit);
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await client.query(
      `
      SELECT solution_id, device_id, observed_at, quality, summary
      FROM rtk.solution
      ${whereClause}
      ORDER BY observed_at DESC, solution_id DESC
      LIMIT $${values.length}
      `,
      values
    );

    return {
      items: result.rows.map((row): RuntimeRtkSolution => ({
        solutionId: Number(row.solution_id),
        deviceId: String(row.device_id),
        observedAt: toIsoString(row.observed_at),
        quality: String(row.quality),
        summary: asJsonObject(row.summary)
      })),
      source: "database"
    } satisfies ResourceCollection<RuntimeRtkSolution>;
  });
});

app.get("/v1/ui/views", async (request) => {
  await requireAuth(request);
  return withRuntimeClient(async (client) => {
    const result = await client.query(
      `
      SELECT saved_view_id, name, layout, owner_account_id, scope_kind, context_key, override_payload, created_at
      FROM ui.saved_view
      WHERE owner_account_id IS NULL OR scope_kind = 'shared_template'
      ORDER BY created_at DESC
      LIMIT 50
      `
    );
    const payload: ResourceCollection<RuntimeSavedView> = {
      items: result.rows.map(mapSavedViewRow),
      source: "database"
    };
    return payload;
  });
});

async function withRuntimeClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!pool) {
    throw new ApiError(503, "CLARTK_RUNTIME_DATABASE_URL is not configured");
  }

  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function withRuntimeTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withRuntimeClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function loadCollection<T>(
  query: string,
  mapRow: (row: DatabaseRow) => T
): Promise<ResourceCollection<T>> {
  if (!pool) {
    return {
      items: [],
      source: "unconfigured"
    };
  }

  const result = await pool.query(query);
  return {
    items: result.rows.map(mapRow),
    source: "database"
  };
}

async function buildRuntimeApiReadiness(): Promise<RuntimeApiReadiness> {
  const basePayload: RuntimeApiReadiness = {
    service: "api",
    status: "degraded",
    workspace: "clartk",
    runtimeDatabaseConfigured: Boolean(config.runtimeDatabaseUrl),
    runtimeDatabaseReachable: false,
    runtimeDatabaseName: "clartk_runtime",
    databaseRole: null,
    currentDatabase: null,
    serverVersion: null,
    migration: {
      status: config.runtimeDatabaseUrl ? "missing_ledger" : "unconfigured",
      ledgerPresent: false,
      expectedCount: 0,
      appliedCount: 0,
      pendingCount: 0,
      driftCount: 0,
      latestAppliedFilename: null,
      latestAppliedAt: null,
      pendingFilenames: [],
      driftedFilenames: []
    }
  };

  if (!pool) {
    return basePayload;
  }

  try {
    return await withRuntimeClient(async (client) => {
      const [databaseResult, migration] = await Promise.all([
        client.query<{
          current_user: string;
          current_database: string;
          server_version: string;
        }>(
          `
          SELECT
            current_user,
            current_database() AS current_database,
            current_setting('server_version') AS server_version
          `
        ),
        loadRuntimeMigrationStatus(client)
      ]);

      const databaseRow = databaseResult.rows[0];
      return {
        service: "api",
        status: migration.status === "ready" ? "ok" : "degraded",
        workspace: "clartk",
        runtimeDatabaseConfigured: true,
        runtimeDatabaseReachable: true,
        runtimeDatabaseName: "clartk_runtime",
        databaseRole: databaseRow ? String(databaseRow.current_user) : null,
        currentDatabase: databaseRow ? String(databaseRow.current_database) : null,
        serverVersion: databaseRow ? String(databaseRow.server_version) : null,
        migration
      };
    });
  } catch (error) {
    app.log.warn(error);
    return basePayload;
  }
}

async function loadRuntimeMigrationStatus(
  client: PoolClient
): Promise<RuntimeApiReadiness["migration"]> {
  const migrationFiles = await listRuntimeMigrationFiles();
  const ledgerResult = await client.query<{ ledger_present: boolean }>(
    "SELECT (to_regclass('meta.schema_migration') IS NOT NULL) AS ledger_present"
  );

  if (!ledgerResult.rows[0]?.ledger_present) {
    return {
      status: "missing_ledger",
      ledgerPresent: false,
      expectedCount: migrationFiles.length,
      appliedCount: 0,
      pendingCount: migrationFiles.length,
      driftCount: 0,
      latestAppliedFilename: null,
      latestAppliedAt: null,
      pendingFilenames: migrationFiles.map((file) => file.filename),
      driftedFilenames: []
    };
  }

  const appliedResult = await client.query<{
    filename: string;
    checksum_sha256: string;
    applied_at: Date;
  }>(
    `
    SELECT filename, checksum_sha256, applied_at
    FROM meta.schema_migration
    WHERE database_name = $1
    ORDER BY applied_at ASC, schema_migration_id ASC
    `,
    ["clartk_runtime"]
  );

  const appliedByFilename = new Map(
    appliedResult.rows.map((row) => [
      row.filename,
      {
        checksum: String(row.checksum_sha256),
        appliedAt: toIsoString(row.applied_at)
      }
    ])
  );

  const pendingFilenames: string[] = [];
  const driftedFilenames: string[] = [];

  for (const migration of migrationFiles) {
    const applied = appliedByFilename.get(migration.filename);
    if (!applied) {
      pendingFilenames.push(migration.filename);
      continue;
    }
    if (applied.checksum !== migration.checksumSha256) {
      driftedFilenames.push(migration.filename);
    }
  }

  const latestApplied = appliedResult.rows.at(-1) ?? null;

  return {
    status:
      driftedFilenames.length > 0
        ? "drift"
        : pendingFilenames.length > 0
          ? "pending"
          : "ready",
    ledgerPresent: true,
    expectedCount: migrationFiles.length,
    appliedCount: appliedResult.rows.length,
    pendingCount: pendingFilenames.length,
    driftCount: driftedFilenames.length,
    latestAppliedFilename: latestApplied ? String(latestApplied.filename) : null,
    latestAppliedAt: latestApplied ? toIsoString(latestApplied.applied_at) : null,
    pendingFilenames,
    driftedFilenames
  };
}

async function listRuntimeMigrationFiles(): Promise<Array<{ filename: string; checksumSha256: string }>> {
  const entries = await fs.readdir(runtimeMigrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql") && entry.name.includes("runtime"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    files.map(async (filename) => {
      const buffer = await fs.readFile(path.join(runtimeMigrationsDir, filename));
      return {
        filename,
        checksumSha256: createHash("sha256").update(buffer).digest("hex")
      };
    })
  );
}

async function requireAuth(request: {
  headers: Record<string, unknown>;
}): Promise<AuthContext> {
  const authorization = optionalString(request.headers.authorization);
  if (authorization?.startsWith("Bearer ")) {
    const parsed = parseOpaqueCredential(authorization.slice("Bearer ".length).trim());
    if (!parsed) {
      throw new ApiError(401, "invalid bearer token");
    }

    return withRuntimeTransaction(async (client) => {
      const row = await client.query(
        `
        SELECT
          at.api_token_id,
          at.token_id,
          at.label,
          at.created_at AS token_created_at,
          at.last_used_at,
          at.revoked_at AS token_revoked_at,
          a.account_id,
          a.email,
          a.display_name,
          a.role,
          a.default_provider_kind,
          a.created_at,
          a.disabled_at
        FROM auth.api_token AS at
        JOIN auth.account AS a ON a.account_id = at.account_id
        WHERE at.token_id = $1
        `,
        [parsed.id]
      );
      const record = row.rows[0];
      if (!record || record.token_revoked_at || record.disabled_at) {
        throw new ApiError(401, "invalid bearer token");
      }

      const secretHashResult = await client.query(
        "SELECT secret_hash FROM auth.api_token WHERE token_id = $1",
        [parsed.id]
      );
      const secretHash = secretHashResult.rows[0]?.secret_hash;
      if (!secretHash || !verifyOpaqueSecret(parsed.secret, String(secretHash))) {
        throw new ApiError(401, "invalid bearer token");
      }

      await client.query(
        "UPDATE auth.api_token SET last_used_at = NOW() WHERE token_id = $1",
        [parsed.id]
      );

      const account = mapAccountRow(record);
      const token = mapApiTokenRow({
        api_token_id: record.api_token_id,
        token_id: record.token_id,
        label: record.label,
        created_at: record.token_created_at,
        last_used_at: record.last_used_at,
        revoked_at: record.token_revoked_at
      });

      return {
        account,
        session: null,
        token
      };
    });
  }

  const cookieValue = parseCookies(optionalString(request.headers.cookie))[config.sessionCookieName];
  if (!cookieValue) {
    throw new ApiError(401, "authentication required");
  }

  const parsed = parseOpaqueCredential(cookieValue);
  if (!parsed) {
    throw new ApiError(401, "invalid session cookie");
  }

  return withRuntimeTransaction(async (client) => {
    const row = await client.query(
      `
      SELECT
        s.session_id,
        s.secret_hash,
        s.created_at AS session_created_at,
        s.expires_at,
        s.last_seen_at,
        s.revoked_at AS session_revoked_at,
        a.account_id,
        a.email,
        a.display_name,
        a.role,
        a.default_provider_kind,
        a.created_at,
        a.disabled_at
      FROM auth.session AS s
      JOIN auth.account AS a ON a.account_id = s.account_id
      WHERE s.session_id = $1
      `,
      [parsed.id]
    );
    const record = row.rows[0];
    if (!record) {
      throw new ApiError(401, "invalid session cookie");
    }
    if (record.session_revoked_at || record.disabled_at) {
      throw new ApiError(401, "session is no longer active");
    }
    const expiresAt = record.expires_at instanceof Date ? record.expires_at : new Date(record.expires_at);
    if (expiresAt.getTime() <= Date.now()) {
      throw new ApiError(401, "session expired");
    }
    if (!verifyOpaqueSecret(parsed.secret, String(record.secret_hash))) {
      throw new ApiError(401, "invalid session cookie");
    }

    await client.query("UPDATE auth.session SET last_seen_at = NOW() WHERE session_id = $1", [parsed.id]);

    return {
      account: mapAccountRow(record),
      session: mapSessionRow({
        session_id: record.session_id,
        created_at: record.session_created_at,
        expires_at: record.expires_at,
        last_seen_at: record.last_seen_at
      }),
      token: null
    };
  });
}

async function loadAuthenticatedMe(
  accountId: AccountId,
  session: Session | null
): Promise<AuthenticatedMe> {
  return withRuntimeClient(async (client) => {
    const account = await loadAccount(client, accountId);
    const profile = await loadOrCreateProfile(client, accountId);
    const tokensResult = await client.query(
      `
      SELECT api_token_id, token_id, label, created_at, last_used_at, revoked_at
      FROM auth.api_token
      WHERE account_id = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC
      `,
      [accountId]
    );
    const payload: AuthenticatedMe = {
      account,
      session,
      apiTokens: tokensResult.rows.map(mapApiTokenRow),
      profile
    };
    return payload;
  });
}

async function loadEffectiveProfile(
  accountId: AccountId,
  viewId: number | null
): Promise<EffectiveOperatorProfile> {
  return withRuntimeClient(async (client) => {
    const profile = await loadOrCreateProfile(client, accountId);
    let appliedViewOverride: ViewOverride | null = null;
    let effectiveDefaults = profile.defaults;

    if (viewId !== null) {
      const result = await client.query(
        `
        SELECT saved_view_id, name, layout, owner_account_id, scope_kind, context_key, override_payload, created_at
        FROM ui.saved_view
        WHERE saved_view_id = $1
          AND (
            owner_account_id = $2
            OR owner_account_id IS NULL
            OR scope_kind = 'shared_template'
          )
        `,
        [viewId, accountId]
      );
      const row = result.rows[0];
      if (row) {
        appliedViewOverride = mapViewOverrideRow(row);
        effectiveDefaults = normalizeProfileDefaults(
          deepMergeJsonObject(
            profile.defaults as unknown as JsonObject,
            appliedViewOverride.overridePayload
          )
        );
        effectiveDefaults.defaultViewSelection = {
          savedViewId: appliedViewOverride.savedViewId,
          contextKey: appliedViewOverride.contextKey
        };
      }
    }

    return {
      profile,
      effectiveDefaults,
      appliedViewOverride
    };
  });
}

async function loadMyViews(accountId: AccountId): Promise<MyViewsResponse> {
  return withRuntimeClient(async (client) => {
    const [sharedResult, overridesResult] = await Promise.all([
      client.query(
        `
        SELECT saved_view_id, name, layout, owner_account_id, scope_kind, context_key, override_payload, created_at
        FROM ui.saved_view
        WHERE owner_account_id IS NULL OR scope_kind = 'shared_template'
        ORDER BY created_at DESC
        `
      ),
      client.query(
        `
        SELECT saved_view_id, name, layout, owner_account_id, scope_kind, context_key, override_payload, created_at
        FROM ui.saved_view
        WHERE owner_account_id = $1
        ORDER BY created_at DESC
        `,
        [accountId]
      )
    ]);

    return {
      sharedTemplates: sharedResult.rows.map(mapSavedViewRow),
      overrides: overridesResult.rows.map(mapViewOverrideRow),
      source: "database"
    };
  });
}

async function recordRuntimePreferenceObservation(
  account: Account,
  input: {
    eventKind: string;
    signature: string;
    suggestionKind: string;
    candidatePatch?: JsonObject;
    payload?: JsonObject;
    basedOnProfileVersion?: number;
  }
): Promise<PreferenceObservationResult> {
  const candidatePatch = normalizeJsonObject(input.candidatePatch);
  const payload = normalizeJsonObject(input.payload);

  await withRuntimeClient(async (client) => {
    await client.query(
      `
      INSERT INTO ui.preference_event (account_id, event_kind, signature, suggestion_kind, candidate_patch, payload)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [account.accountId, input.eventKind, input.signature, input.suggestionKind, candidatePatch, payload]
    );
  });

  if (!config.agentMemoryBaseUrl || !config.agentMemoryReviewToken) {
    const observation: PreferenceObservation = {
      preferenceObservationId: 0,
      runtimeAccountId: account.accountId,
      eventKind: input.eventKind,
      signature: input.signature,
      suggestionKind: input.suggestionKind,
      candidatePatch,
      payload,
      observedAt: new Date().toISOString()
    };
    return {
      observation,
      suggestion: null
    };
  }

  return agentMemoryRequest<PreferenceObservationResult>("/v1/internal/preferences/observations", {
    method: "POST",
    body: {
      runtimeAccountId: account.accountId,
      eventKind: input.eventKind,
      signature: input.signature,
      suggestionKind: input.suggestionKind,
      candidatePatch,
      payload,
      basedOnProfileVersion: input.basedOnProfileVersion ?? null
    }
  });
}

async function listSuggestionsFromAgentMemory(
  accountId: AccountId
): Promise<PreferenceSuggestionCollection> {
  if (!config.agentMemoryBaseUrl || !config.agentMemoryReviewToken) {
    return {
      items: [],
      source: "unconfigured"
    };
  }

  return agentMemoryRequest<PreferenceSuggestionCollection>(
    `/v1/internal/preferences/suggestions?runtimeAccountId=${encodeURIComponent(accountId)}`,
    {
      method: "GET"
    }
  );
}

async function getSuggestionFromAgentMemory(
  suggestionId: number
): Promise<PreferenceSuggestion | null> {
  if (!config.agentMemoryBaseUrl || !config.agentMemoryReviewToken) {
    return null;
  }

  return agentMemoryRequest<PreferenceSuggestion | null>(
    `/v1/internal/preferences/suggestions/${suggestionId}`,
    {
      method: "GET"
    }
  );
}

async function reviewSuggestionInAgentMemory(
  suggestionId: number,
  payload: {
    reviewerRuntimeAccountId: AccountId;
    reviewerRole: AuthRole;
    outcome: SuggestionReviewOutcome;
    notes: string | null;
  }
): Promise<PreferenceSuggestion> {
  return agentMemoryRequest<PreferenceSuggestion>(
    `/v1/internal/preferences/suggestions/${suggestionId}/reviews`,
    {
      method: "POST",
      body: payload
    }
  );
}

async function markSuggestionPublishedInAgentMemory(
  suggestionId: number,
  payload: {
    runtimeProfileChangeId: number;
    publishedByRuntimeAccountId: AccountId;
    result: JsonObject;
  }
): Promise<PreferenceSuggestion> {
  return agentMemoryRequest<PreferenceSuggestion>(
    `/v1/internal/preferences/suggestions/${suggestionId}/publications`,
    {
      method: "POST",
      body: payload
    }
  );
}

async function agentMemoryRequest<T>(
  path: string,
  init: {
    method: string;
    body?: unknown;
  }
): Promise<T> {
  if (!config.agentMemoryBaseUrl || !config.agentMemoryReviewToken) {
    throw new ApiError(503, "agent-memory suggestion service is not configured");
  }

  const response = await fetch(new URL(path, config.agentMemoryBaseUrl).toString(), {
    method: init.method,
    headers: {
      "content-type": "application/json",
      "x-clartk-review-token": config.agentMemoryReviewToken
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });

  if (response.status === 404) {
    return null as T;
  }

  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as { error?: string };
      detail = payload.error ? ` ${payload.error}` : "";
    } catch {
      detail = "";
    }
    throw new ApiError(503, `agent-memory request failed: ${response.status}${detail}`);
  }

  return (await response.json()) as T;
}

async function createAccountRecord(
  client: PoolClient,
  input: {
    email: string;
    password: string;
    displayName: string;
    role: AuthRole;
  }
): Promise<Account> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!email || !displayName) {
    throw new ApiError(400, "email and displayName are required");
  }

  try {
    const accountResult = await client.query(
      `
      INSERT INTO auth.account (email, display_name, role, default_provider_kind)
      VALUES ($1, $2, $3, 'local')
      RETURNING account_id, email, display_name, role, default_provider_kind, created_at, disabled_at
      `,
      [email, displayName, input.role]
    );
    const account = mapAccountRow(accountResult.rows[0]);

    await client.query(
      `
      INSERT INTO auth.provider_identity (account_id, provider_kind, provider_subject, password_hash)
      VALUES ($1, 'local', $2, $3)
      `,
      [account.accountId, email, hashPassword(input.password)]
    );

    await client.query(
      `
      INSERT INTO ui.operator_profile (account_id, defaults, updated_by_account_id)
      VALUES ($1, $2, $1)
      ON CONFLICT (account_id) DO NOTHING
      `,
      [account.accountId, createDefaultProfileDefaults()]
    );

    return account;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, "account already exists");
    }
    throw error;
  }
}

async function createSessionRecord(
  client: PoolClient,
  accountId: AccountId
): Promise<{ session: Session; cookieValue: string }> {
  const id = createOpaqueId("sess");
  const secret = randomBytes(24).toString("hex");
  const cookieValue = `${id}.${secret}`;
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000);

  const result = await client.query(
    `
    INSERT INTO auth.session (session_id, account_id, secret_hash, expires_at, metadata)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING session_id, created_at, expires_at, last_seen_at
    `,
    [id, accountId, hashOpaqueSecret(secret), expiresAt, { issuedBy: "runtime-api" }]
  );

  return {
    session: mapSessionRow(result.rows[0]),
    cookieValue
  };
}

async function createApiTokenRecord(
  client: PoolClient,
  accountId: AccountId,
  label: string
): Promise<ApiTokenCreateResult> {
  const id = createOpaqueId("tok");
  const secret = randomBytes(24).toString("hex");
  const bearerToken = `${id}.${secret}`;
  const result = await client.query(
    `
    INSERT INTO auth.api_token (token_id, account_id, label, secret_hash, metadata)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING api_token_id, token_id, label, created_at, last_used_at, revoked_at
    `,
    [id, accountId, label.trim(), hashOpaqueSecret(secret), { issuedBy: "runtime-api" }]
  );

  return {
    apiToken: mapApiTokenRow(result.rows[0]),
    bearerToken
  };
}

async function lookupLocalIdentity(client: PoolClient, email: string): Promise<DatabaseRow | null> {
  const result = await client.query(
    `
    SELECT
      a.account_id,
      a.email,
      a.display_name,
      a.role,
      a.default_provider_kind,
      a.created_at,
      a.disabled_at,
      pi.password_hash
    FROM auth.provider_identity AS pi
    JOIN auth.account AS a ON a.account_id = pi.account_id
    WHERE pi.provider_kind = 'local' AND pi.provider_subject = $1
    `,
    [email]
  );
  return result.rows[0] ?? null;
}

async function loadAccount(client: PoolClient, accountId: AccountId): Promise<Account> {
  const result = await client.query(
    `
    SELECT account_id, email, display_name, role, default_provider_kind, created_at, disabled_at
    FROM auth.account
    WHERE account_id = $1
    `,
    [accountId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "account not found");
  }
  return mapAccountRow(row);
}

async function loadOrCreateProfile(client: PoolClient, accountId: AccountId) {
  const result = await client.query(
    `
    SELECT operator_profile_id, account_id, version, defaults, created_at, updated_at, updated_by_account_id
    FROM ui.operator_profile
    WHERE account_id = $1
    `,
    [accountId]
  );
  const row = result.rows[0];
  if (row) {
    return mapOperatorProfileRow(row);
  }

  await client.query(
    `
    INSERT INTO ui.operator_profile (account_id, defaults, updated_by_account_id)
    VALUES ($1, $2, $1)
    ON CONFLICT (account_id) DO NOTHING
    `,
    [accountId, createDefaultProfileDefaults()]
  );

  const created = await client.query(
    `
    SELECT operator_profile_id, account_id, version, defaults, created_at, updated_at, updated_by_account_id
    FROM ui.operator_profile
    WHERE account_id = $1
    `,
    [accountId]
  );
  return mapOperatorProfileRow(created.rows[0]);
}

async function upsertProfile(
  client: PoolClient,
  accountId: AccountId,
  defaults: ProfileDefaults,
  updatedByAccountId: AccountId
) {
  const result = await client.query(
    `
    INSERT INTO ui.operator_profile (account_id, defaults, version, updated_at, updated_by_account_id)
    VALUES ($1, $2, 1, NOW(), $3)
    ON CONFLICT (account_id)
    DO UPDATE SET
      defaults = EXCLUDED.defaults,
      version = ui.operator_profile.version + 1,
      updated_at = NOW(),
      updated_by_account_id = EXCLUDED.updated_by_account_id
    RETURNING operator_profile_id, account_id, version, defaults, created_at, updated_at, updated_by_account_id
    `,
    [accountId, defaults, updatedByAccountId]
  );
  return mapOperatorProfileRow(result.rows[0]);
}

async function insertProfileChange(
  client: PoolClient,
  input: {
    accountId: AccountId;
    actorAccountId: AccountId;
    sourceKind: string;
    suggestionId: number | null;
    profileVersion: number;
    changePayload: JsonObject;
  }
): Promise<PublishedProfileChange> {
  const result = await client.query(
    `
    INSERT INTO ui.profile_change (account_id, actor_account_id, source_kind, suggestion_id, profile_version, change_payload)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING profile_change_id, account_id, actor_account_id, source_kind, suggestion_id, profile_version, change_payload, created_at
    `,
    [
      input.accountId,
      input.actorAccountId,
      input.sourceKind,
      input.suggestionId,
      input.profileVersion,
      input.changePayload
    ]
  );
  return mapPublishedProfileChangeRow(result.rows[0]);
}

async function loadProfile(accountId: AccountId) {
  return withRuntimeClient(async (client) => loadOrCreateProfile(client, accountId));
}

function buildAuthSessionResult(
  account: Account,
  session: Session,
  profile: Awaited<ReturnType<typeof loadProfile>>
): AuthSessionResult {
  return {
    account,
    session,
    profile
  };
}

function resolveTargetAccountId(auth: AuthContext, requestedAccountId: string | null): AccountId {
  if (!requestedAccountId || requestedAccountId === auth.account.accountId) {
    return auth.account.accountId;
  }
  requireAdmin(auth);
  return requestedAccountId;
}

function requireAdmin(auth: AuthContext): void {
  if (auth.account.role !== "admin") {
    throw new ApiError(403, "admin role required");
  }
}

function normalizeRole(value: unknown): AuthRole {
  if (value === "operator" || value === "admin") {
    return value;
  }
  throw new ApiError(400, "role must be operator or admin");
}

function normalizeReviewOutcome(value: unknown): SuggestionReviewOutcome {
  if (value === "approved" || value === "rejected") {
    return value;
  }
  throw new ApiError(400, "outcome must be approved or rejected");
}

function mapAccountRow(row: DatabaseRow): Account {
  return {
    accountId: String(row.account_id),
    email: String(row.email),
    displayName: String(row.display_name),
    role: normalizeRole(row.role),
    defaultProviderKind: String(row.default_provider_kind),
    createdAt: toIsoString(row.created_at),
    disabledAt: row.disabled_at ? toIsoString(row.disabled_at) : null
  };
}

function mapSessionRow(row: DatabaseRow): Session {
  return {
    sessionId: String(row.session_id),
    createdAt: toIsoString(row.created_at),
    expiresAt: toIsoString(row.expires_at),
    lastSeenAt: row.last_seen_at ? toIsoString(row.last_seen_at) : null
  };
}

function mapApiTokenRow(row: DatabaseRow): ApiToken {
  return {
    apiTokenId: Number(row.api_token_id),
    tokenId: String(row.token_id),
    label: String(row.label),
    createdAt: toIsoString(row.created_at),
    lastUsedAt: row.last_used_at ? toIsoString(row.last_used_at) : null,
    revokedAt: row.revoked_at ? toIsoString(row.revoked_at) : null
  };
}

function mapOperatorProfileRow(row: DatabaseRow) {
  return {
    operatorProfileId: Number(row.operator_profile_id),
    accountId: String(row.account_id),
    version: Number(row.version),
    defaults: normalizeProfileDefaults(asJsonObject(row.defaults)),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    updatedByAccountId: row.updated_by_account_id ? String(row.updated_by_account_id) : null
  };
}

function mapSavedViewRow(row: DatabaseRow): RuntimeSavedView {
  return {
    savedViewId: Number(row.saved_view_id),
    name: String(row.name),
    layout: asJsonObject(row.layout),
    createdAt: toIsoString(row.created_at),
    ownerAccountId: row.owner_account_id ? String(row.owner_account_id) : null,
    scopeKind: row.scope_kind === "account_override" ? "account_override" : "shared_template",
    contextKey: row.context_key ? String(row.context_key) : null,
    overridePayload: asJsonObject(row.override_payload)
  };
}

function mapViewOverrideRow(row: DatabaseRow): ViewOverride {
  return {
    savedViewId: Number(row.saved_view_id),
    ownerAccountId: String(row.owner_account_id),
    scopeKind: "account_override",
    contextKey: row.context_key ? String(row.context_key) : null,
    name: String(row.name),
    layout: asJsonObject(row.layout),
    overridePayload: asJsonObject(row.override_payload),
    createdAt: toIsoString(row.created_at)
  };
}

function mapPublishedProfileChangeRow(row: DatabaseRow): PublishedProfileChange {
  return {
    profileChangeId: Number(row.profile_change_id),
    accountId: String(row.account_id),
    actorAccountId: String(row.actor_account_id),
    sourceKind: String(row.source_kind),
    suggestionId: row.suggestion_id === null ? null : Number(row.suggestion_id),
    profileVersion: Number(row.profile_version),
    changePayload: asJsonObject(row.change_payload),
    createdAt: toIsoString(row.created_at)
  };
}

function parseCookies(rawCookieHeader: string | null | undefined): Record<string, string> {
  if (!rawCookieHeader) {
    return {};
  }

  return rawCookieHeader.split(";").reduce<Record<string, string>>((cookies, segment) => {
    const index = segment.indexOf("=");
    if (index <= 0) {
      return cookies;
    }
    const key = segment.slice(0, index).trim();
    const value = segment.slice(index + 1).trim();
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function setSessionCookie(reply: { header: (name: string, value: string) => void }, value: string, expiresAt: string) {
  const cookie = [
    `${config.sessionCookieName}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`
  ];
  if (config.secureCookies) {
    cookie.push("Secure");
  }
  reply.header("Set-Cookie", cookie.join("; "));
}

function clearSessionCookie(reply: { header: (name: string, value: string) => void }) {
  const cookie = [
    `${config.sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ];
  if (config.secureCookies) {
    cookie.push("Secure");
  }
  reply.header("Set-Cookie", cookie.join("; "));
}

function parseOpaqueCredential(value: string): { id: string; secret: string } | null {
  const separator = value.indexOf(".");
  if (separator <= 0 || separator === value.length - 1) {
    return null;
  }
  return {
    id: value.slice(0, separator),
    secret: value.slice(separator + 1)
  };
}

function expandLoopbackOrigins(origin: string): string[] {
  try {
    const parsed = new URL(origin);
    const origins = new Set([parsed.origin]);
    if (parsed.hostname === "localhost") {
      origins.add(new URL(`${parsed.protocol}//127.0.0.1${parsed.port ? `:${parsed.port}` : ""}`).origin);
    }
    if (parsed.hostname === "127.0.0.1") {
      origins.add(new URL(`${parsed.protocol}//localhost${parsed.port ? `:${parsed.port}` : ""}`).origin);
    }
    return [...origins];
  } catch {
    return [origin];
  }
}

function clampPositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.trunc(value);
  return rounded > 0 ? rounded : fallback;
}

function createOpaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function hashOpaqueSecret(secret: string): string {
  return `sha256$${createHash("sha256").update(secret).digest("hex")}`;
}

function verifyOpaqueSecret(secret: string, storedHash: string): boolean {
  const [, expectedHex = ""] = storedHash.split("$");
  const expected = Buffer.from(expectedHex, "hex");
  const actual = createHash("sha256").update(secret).digest();
  if (expected.length !== actual.length || expected.length === 0) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

function hashPassword(password: string): string {
  const nonce = randomBytes(16);
  const digest = argon2Sync("argon2id", {
    message: password,
    nonce,
    parallelism: 1,
    tagLength: 32,
    memory: 65536,
    passes: 3
  });
  return `argon2id$${nonce.toString("base64")}$${digest.toString("base64")}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [kind, nonceBase64, digestBase64] = storedHash.split("$");
  if (kind !== "argon2id" || !nonceBase64 || !digestBase64) {
    return false;
  }

  const expected = Buffer.from(digestBase64, "base64");
  const actual = argon2Sync("argon2id", {
    message: password,
    nonce: Buffer.from(nonceBase64, "base64"),
    parallelism: 1,
    tagLength: expected.length,
    memory: 65536,
    passes: 3
  });

  return timingSafeEqual(expected, actual);
}

function normalizeProfileDefaults(value: JsonObject): ProfileDefaults {
  const base = createDefaultProfileDefaults();

  const units = asJsonObject(value.units);
  const telemetry = asJsonObject(value.telemetry);
  const devices = asJsonObject(value.devices);
  const map = asJsonObject(value.map);
  const notifications = asJsonObject(value.notifications);
  const defaultViewSelection = asJsonObject(value.defaultViewSelection);

  return {
    units: {
      distance: units.distance === "imperial" ? "imperial" : "metric",
      coordinateFormat: units.coordinateFormat === "dms" ? "dms" : "decimal"
    },
    telemetry: {
      defaultWindowMinutes: normalizePositiveInteger(
        telemetry.defaultWindowMinutes,
        base.telemetry.defaultWindowMinutes
      )
    },
    devices: {
      defaultHardwareFilter: optionalString(devices.defaultHardwareFilter) ?? "",
      sortBy:
        devices.sortBy === "hardware_family" || devices.sortBy === "external_id"
          ? devices.sortBy
          : "recent",
      pinnedDeviceIds: normalizeStringArray(devices.pinnedDeviceIds),
      pinnedGroups: normalizeStringArray(devices.pinnedGroups)
    },
    map: {
      defaultLayerNames: normalizeStringArray(map.defaultLayerNames, base.map.defaultLayerNames)
    },
    notifications: {
      solverStatus:
        typeof notifications.solverStatus === "boolean"
          ? notifications.solverStatus
          : base.notifications.solverStatus,
      deviceOffline:
        typeof notifications.deviceOffline === "boolean"
          ? notifications.deviceOffline
          : base.notifications.deviceOffline
    },
    defaultViewSelection: {
      savedViewId:
        defaultViewSelection.savedViewId === null || defaultViewSelection.savedViewId === undefined
          ? null
          : Number(defaultViewSelection.savedViewId),
      contextKey: optionalString(defaultViewSelection.contextKey)
    }
  };
}

function deepMergeJsonObject(base: JsonObject, patch: JsonObject): JsonObject {
  const result: JsonObject = { ...base };

  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = result[key];
    if (isJsonObject(baseValue) && isJsonObject(patchValue)) {
      result[key] = deepMergeJsonObject(baseValue, patchValue);
      continue;
    }
    result[key] = patchValue;
  }

  return result;
}

function normalizeStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }
  return Math.round(number);
}

function normalizeListLimit(value: unknown, fallback: number, maximum = 200): number {
  return Math.min(normalizePositiveInteger(value, fallback), maximum);
}

function asBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, `${fieldName} must be a positive integer`);
  }
  return number;
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function optionalPositiveInteger(value: unknown, fieldName: string): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return requirePositiveInteger(value, fieldName);
}

function optionalTimestamp(value: unknown, fieldName: string): string | null {
  const text = optionalString(value);
  if (!text) {
    return null;
  }

  const timestamp = new Date(text);
  if (Number.isNaN(timestamp.getTime())) {
    throw new ApiError(400, `${fieldName} must be an ISO-8601 timestamp`);
  }

  return timestamp.toISOString();
}

function requireJsonObject(value: unknown, fieldName: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new ApiError(400, `${fieldName} must be a JSON object`);
  }
  return value;
}

function optionalJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

function normalizeJsonObject(value: JsonObject | undefined): JsonObject {
  return value ? value : {};
}

function asJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (!isJsonObject(value)) {
    return value;
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortJsonValue(value[key]);
  }
  return sorted;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(String(value)).toISOString();
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
  );
}

if (process.env.CLARTK_API_AUTOSTART === "1") {
  app.listen({ host: config.host, port: config.port }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}

export { app };
