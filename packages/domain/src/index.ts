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
export type AccountId = string;
export type TimestampIsoString = string;
export type ResourceSource = "database" | "unconfigured";
export type ServiceStatus = "ok" | "degraded";
export type AuthRole = "operator" | "admin";
export type ViewScopeKind = "shared_template" | "account_override";
export type PreferenceSuggestionStatus = "proposed" | "approved" | "rejected" | "published";
export type SuggestionReviewOutcome = "approved" | "rejected";

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
  ownerAccountId?: AccountId | null;
  scopeKind?: ViewScopeKind;
  contextKey?: string | null;
  overridePayload?: JsonObject;
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

export interface Account {
  accountId: AccountId;
  email: string;
  displayName: string;
  role: AuthRole;
  defaultProviderKind: string;
  createdAt: TimestampIsoString;
  disabledAt: TimestampIsoString | null;
}

export interface Session {
  sessionId: string;
  createdAt: TimestampIsoString;
  expiresAt: TimestampIsoString;
  lastSeenAt: TimestampIsoString | null;
}

export interface ApiToken {
  apiTokenId: number;
  tokenId: string;
  label: string;
  createdAt: TimestampIsoString;
  lastUsedAt: TimestampIsoString | null;
  revokedAt: TimestampIsoString | null;
}

export interface ProfileDefaults {
  units: {
    distance: "metric" | "imperial";
    coordinateFormat: "decimal" | "dms";
  };
  telemetry: {
    defaultWindowMinutes: number;
  };
  devices: {
    defaultHardwareFilter: string;
    sortBy: "recent" | "hardware_family" | "external_id";
    pinnedDeviceIds: string[];
    pinnedGroups: string[];
  };
  map: {
    defaultLayerNames: string[];
  };
  notifications: {
    solverStatus: boolean;
    deviceOffline: boolean;
  };
  defaultViewSelection: {
    savedViewId: number | null;
    contextKey: string | null;
  };
}

export interface OperatorProfile {
  operatorProfileId: number;
  accountId: AccountId;
  version: number;
  defaults: ProfileDefaults;
  createdAt: TimestampIsoString;
  updatedAt: TimestampIsoString;
  updatedByAccountId: AccountId | null;
}

export interface ViewOverride {
  savedViewId: number;
  ownerAccountId: AccountId;
  scopeKind: ViewScopeKind;
  contextKey: string | null;
  name: string;
  layout: JsonObject;
  overridePayload: JsonObject;
  createdAt: TimestampIsoString;
}

export interface EffectiveOperatorProfile {
  profile: OperatorProfile;
  effectiveDefaults: ProfileDefaults;
  appliedViewOverride: ViewOverride | null;
}

export interface AuthenticatedMe {
  account: Account;
  session: Session | null;
  apiTokens: ApiToken[];
  profile: OperatorProfile;
}

export interface AuthSessionResult {
  account: Account;
  session: Session;
  profile: OperatorProfile;
}

export interface ApiTokenCreateResult {
  apiToken: ApiToken;
  bearerToken: string;
}

export interface MyViewsResponse {
  sharedTemplates: RuntimeSavedView[];
  overrides: ViewOverride[];
  source: ResourceSource;
}

export interface PreferenceObservation {
  preferenceObservationId: number;
  runtimeAccountId: AccountId;
  eventKind: string;
  signature: string;
  suggestionKind: string;
  candidatePatch: JsonObject;
  payload: JsonObject;
  observedAt: TimestampIsoString;
}

export interface SuggestionReview {
  preferenceReviewId: number;
  preferenceSuggestionId: number;
  reviewerRuntimeAccountId: AccountId;
  reviewerRole: AuthRole;
  outcome: SuggestionReviewOutcome;
  notes: string | null;
  createdAt: TimestampIsoString;
}

export interface PreferenceSuggestion {
  preferenceSuggestionId: number;
  runtimeAccountId: AccountId;
  suggestionKind: string;
  status: PreferenceSuggestionStatus;
  rationale: string;
  confidence: number | null;
  candidatePatch: JsonObject;
  evidence: JsonValue[];
  basedOnProfileVersion: number | null;
  signature: string;
  createdAt: TimestampIsoString;
  updatedAt: TimestampIsoString;
  publishedRuntimeChangeId: number | null;
  reviews: SuggestionReview[];
}

export interface PreferenceObservationResult {
  observation: PreferenceObservation;
  suggestion: PreferenceSuggestion | null;
}

export interface PreferenceSuggestionCollection {
  items: PreferenceSuggestion[];
  source: "dev-memory" | "unconfigured";
}

export interface PublishedProfileChange {
  profileChangeId: number;
  accountId: AccountId;
  actorAccountId: AccountId;
  sourceKind: string;
  suggestionId: number | null;
  profileVersion: number;
  changePayload: JsonObject;
  createdAt: TimestampIsoString;
}

export interface SuggestionPublishResult {
  profile: OperatorProfile;
  effectiveProfile: EffectiveOperatorProfile;
  publishedChange: PublishedProfileChange;
  suggestion: PreferenceSuggestion;
}

export function createDefaultProfileDefaults(): ProfileDefaults {
  return {
    units: {
      distance: "metric",
      coordinateFormat: "decimal"
    },
    telemetry: {
      defaultWindowMinutes: 30
    },
    devices: {
      defaultHardwareFilter: "",
      sortBy: "recent",
      pinnedDeviceIds: [],
      pinnedGroups: []
    },
    map: {
      defaultLayerNames: ["rtk-track", "device-health"]
    },
    notifications: {
      solverStatus: true,
      deviceOffline: true
    },
    defaultViewSelection: {
      savedViewId: null,
      contextKey: null
    }
  };
}
