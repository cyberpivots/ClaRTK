export const PROTO_ROOT = "contracts/proto" as const;
export const DOMAIN_VERSION = "0.1.0" as const;
export const CLARTK_RUNTIME_DATABASE_NAME = "clartk_runtime" as const;
export const CLARTK_DEV_DATABASE_NAME = "clartk_dev" as const;
export const CLARTK_DEFAULT_API_PORT = 3000 as const;
export const CLARTK_DEFAULT_AGENT_MEMORY_PORT = 3100 as const;
export const CLARTK_DEFAULT_GATEWAY_DIAGNOSTICS_PORT = 3200 as const;
export const CLARTK_DEFAULT_DASHBOARD_PORT = 5173 as const;
export const CLARTK_DEFAULT_POSTGRES_PORT = 5432 as const;
export const CLARTK_DEFAULT_METRO_PORT = 8081 as const;

export type DeviceId = string;
export type TimestampIsoString = string;
export type ResourceSource = "database" | "unconfigured";
export type ServiceStatus = "ok" | "degraded";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ResourceCollection<T> {
  items: T[];
  source: ResourceSource;
}

export interface RuntimeApiHealth {
  service: "api";
  status: ServiceStatus;
  workspace: "clartk";
  contracts: "provisional";
  runtimeDatabaseConfigured: boolean;
  runtimeDatabaseName: typeof CLARTK_RUNTIME_DATABASE_NAME;
  gatewayDiagnosticsBaseUrl: string;
  agentMemoryBaseUrl: string;
}

export interface RuntimeDevice {
  deviceId: DeviceId;
  externalId: string;
  hardwareFamily: string;
  firmwareVersion: string | null;
  config: JsonObject;
  createdAt: TimestampIsoString;
}

export interface RuntimePositionEvent {
  eventId: number;
  deviceId: DeviceId;
  receivedAt: TimestampIsoString;
  payload: JsonObject;
}

export interface RuntimeRtkSolution {
  solutionId: number;
  deviceId: DeviceId;
  observedAt: TimestampIsoString;
  quality: string;
  summary: JsonObject;
}

export interface RuntimeSavedView {
  savedViewId: number;
  name: string;
  layout: JsonObject;
  createdAt: TimestampIsoString;
}

export interface AgentMemoryHealth {
  service: "agent-memory";
  status: ServiceStatus;
  workspace: "clartk";
  devDatabaseConfigured: boolean;
  devDatabaseName: typeof CLARTK_DEV_DATABASE_NAME;
  jobs: string[];
}

export interface SourceDocumentRecord {
  sourceDocumentId: number;
  sourceKind: string;
  uri: string;
  title: string | null;
  body: string;
  metadata: JsonObject;
  capturedAt: TimestampIsoString;
}

export interface KnowledgeClaimRecord {
  knowledgeClaimId: number;
  sourceDocumentId: number | null;
  summary: string;
  status: string;
  tags: JsonValue[];
  createdAt: TimestampIsoString;
}

export interface EvaluationResultRecord {
  evaluationResultId: number;
  subject: string;
  outcome: string;
  detail: JsonObject;
  createdAt: TimestampIsoString;
}

export interface GatewayDiagnosticsHealth {
  service: "rtk-gateway";
  status: ServiceStatus;
  mode: string;
  diagnosticsPort: number;
  runtimeDatabaseConfigured: boolean;
  activeInputs: string[];
  note?: string;
}

export interface GeneratedTypesPending {
  note: "Generate TS types from contracts/proto before using domain messages in production.";
}
