import Fastify from "fastify";
import { Pool } from "pg";
import type {
  JsonObject,
  ResourceCollection,
  RuntimeApiHealth,
  RuntimeDevice,
  RuntimePositionEvent,
  RuntimeRtkSolution,
  RuntimeSavedView
} from "@clartk/domain";

const config = {
  host: process.env.CLARTK_API_HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? process.env.CLARTK_API_PORT ?? "3000"),
  runtimeDatabaseUrl: process.env.CLARTK_RUNTIME_DATABASE_URL,
  gatewayDiagnosticsBaseUrl: process.env.CLARTK_GATEWAY_DIAGNOSTICS_BASE_URL ?? "http://localhost:3200",
  agentMemoryBaseUrl: process.env.CLARTK_AGENT_MEMORY_BASE_URL ?? "http://localhost:3100"
};

const pool = config.runtimeDatabaseUrl
  ? new Pool({
      connectionString: config.runtimeDatabaseUrl
    })
  : null;

const app = Fastify({ logger: true });

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

app.get("/v1/devices", async () => {
  return loadCollection(
    `SELECT device_id, external_id, hardware_family, firmware_version, config, created_at
     FROM device.registry
     ORDER BY created_at DESC
     LIMIT 50`,
    (row): RuntimeDevice => ({
      deviceId: String(row.device_id),
      externalId: row.external_id,
      hardwareFamily: row.hardware_family,
      firmwareVersion: row.firmware_version,
      config: asJsonObject(row.config),
      createdAt: row.created_at.toISOString()
    })
  );
});

app.get("/v1/telemetry/positions", async () => {
  return loadCollection(
    `SELECT event_id, device_id, received_at, payload
     FROM telemetry.position_event
     ORDER BY received_at DESC
     LIMIT 50`,
    (row): RuntimePositionEvent => ({
      eventId: row.event_id,
      deviceId: String(row.device_id),
      receivedAt: row.received_at.toISOString(),
      payload: asJsonObject(row.payload)
    })
  );
});

app.get("/v1/rtk/solutions", async () => {
  return loadCollection(
    `SELECT solution_id, device_id, observed_at, quality, summary
     FROM rtk.solution
     ORDER BY observed_at DESC
     LIMIT 50`,
    (row): RuntimeRtkSolution => ({
      solutionId: row.solution_id,
      deviceId: String(row.device_id),
      observedAt: row.observed_at.toISOString(),
      quality: row.quality,
      summary: asJsonObject(row.summary)
    })
  );
});

app.get("/v1/ui/views", async () => {
  return loadCollection(
    `SELECT saved_view_id, name, layout, created_at
     FROM ui.saved_view
     ORDER BY created_at DESC
     LIMIT 50`,
    (row): RuntimeSavedView => ({
      savedViewId: row.saved_view_id,
      name: row.name,
      layout: asJsonObject(row.layout),
      createdAt: row.created_at.toISOString()
    })
  );
});

async function loadCollection<T>(
  query: string,
  mapRow: (row: Record<string, any>) => T
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

function asJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return {};
}

if (process.env.CLARTK_API_AUTOSTART === "1") {
  app.listen({ host: config.host, port: config.port }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}

export { app };
