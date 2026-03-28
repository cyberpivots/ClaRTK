export const PROTO_ROOT = "contracts/proto" as const;
export const DOMAIN_VERSION = "0.1.0" as const;
export const CLARTK_RUNTIME_DATABASE_NAME = "clartk_runtime" as const;
export const CLARTK_DEV_DATABASE_NAME = "clartk_dev" as const;
export const CLARTK_DEFAULT_API_PORT = 3000 as const;
export const CLARTK_DEFAULT_AGENT_MEMORY_PORT = 3100 as const;
export const CLARTK_DEFAULT_GATEWAY_DIAGNOSTICS_PORT = 3200 as const;
export const CLARTK_DEFAULT_DEV_CONSOLE_API_PORT = 3300 as const;
export const CLARTK_DEFAULT_DASHBOARD_PORT = 5173 as const;
export const CLARTK_DEFAULT_DEV_CONSOLE_PORT = 5180 as const;
export const CLARTK_DEFAULT_POSTGRES_PORT = 55432 as const;
export const CLARTK_DEFAULT_METRO_PORT = 8081 as const;

export type DeviceId = string;
export type AccountId = string;
export type TimestampIsoString = string;
export type ResourceSource = "database" | "unconfigured";
export type CatalogSource = "filesystem" | "unconfigured";
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

// Compatibility shapes retained until downstream adoption tasks move callers to generatedContracts.
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

export interface DevConsoleApiHealth {
  service: "dev-console-api";
  status: ServiceStatus;
  workspace: "clartk";
  runtimeApiBaseUrl: string;
  agentMemoryBaseUrl: string;
}

export interface WorkspaceServiceHealth {
  service: string;
  status: ServiceStatus;
  url: string;
  detail: JsonObject;
}

export interface BackupSummary {
  latestBackupDir: string;
  latestBackupKind: string;
  latestBackupCreatedAt: TimestampIsoString | null;
}

export interface WorkspaceOverview {
  status: ServiceStatus;
  postgres: {
    host: string;
    port: number;
    source: string;
    reachable: boolean;
  };
  backup: BackupSummary | null;
  services: WorkspaceServiceHealth[];
}

export interface CoordinatorEndpointSummary {
  runtimeApiBaseUrl: string;
  devConsoleApiBaseUrl: string;
  agentMemoryBaseUrl: string;
}

export interface CoordinatorAccountSummary {
  accountId: AccountId;
  email: string;
  role: AuthRole;
}

export interface CoordinatorErrorRecord {
  key: string;
  error: string;
}

export interface AgentTaskDependency {
  agentTaskId: number;
  dependsOnAgentTaskId: number;
  createdAt: TimestampIsoString;
}

export interface AgentTaskRecord {
  agentTaskId: number;
  taskKind: string;
  queueName: string;
  status: string;
  priority: number;
  payload: JsonObject;
  availableAt: TimestampIsoString;
  leaseOwner: string | null;
  leaseExpiresAt: TimestampIsoString | null;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: TimestampIsoString;
  updatedAt: TimestampIsoString;
  completedAt: TimestampIsoString | null;
}

export interface QueueSnapshot {
  queueName: string;
  queuedCount: number;
  leasedCount: number;
  succeededCount: number;
  failedCount: number;
  recentTasks: AgentTaskRecord[];
}

export interface AgentTaskCollection {
  items: AgentTaskRecord[];
  queues: QueueSnapshot[];
  source: "dev-memory" | "unconfigured";
}

export interface AgentRunRecord {
  agentRunId: number;
  agentName: string;
  taskSlug: string;
  status: string;
  startedAt: TimestampIsoString;
  finishedAt: TimestampIsoString | null;
}

export interface AgentRunCollection {
  items: AgentRunRecord[];
  source: "dev-memory" | "unconfigured";
}

export interface UiReviewRunSummary {
  uiReviewRunId: number;
  status: string;
  scenarioSet: string;
  createdAt: TimestampIsoString;
}

export interface CoordinatorCoordinationSummary {
  taskCount: number;
  runCount: number;
  reviewRunCount: number;
  blockedTaskCount: number;
  staleLeaseCount: number;
  queues: QueueSnapshot[];
  latestRuns: AgentRunRecord[];
  latestReviewRuns: UiReviewRunSummary[];
}

export interface CoordinatorCatalogSummary {
  docCount: number;
  skillCount: number;
  coordinatorSkillPresent: boolean;
}

export interface DevCoordinatorStatus {
  generatedAt: TimestampIsoString;
  endpoints: CoordinatorEndpointSummary;
  account: CoordinatorAccountSummary | null;
  workspace: WorkspaceOverview;
  coordination: CoordinatorCoordinationSummary;
  catalog: CoordinatorCatalogSummary;
  errors: CoordinatorErrorRecord[];
  source: "broker" | "script-fallback" | "unconfigured";
}

export interface InventoryItem {
  itemId: number;
  itemKey: string;
  partName: string;
  manufacturer: string | null;
  model: string | null;
  category: string | null;
  classification: string;
  status: string;
  totalUnits: number;
  latestEventId: number | null;
  notesJson: JsonObject;
  createdAt: TimestampIsoString;
  updatedAt: TimestampIsoString;
  sourceKind: string;
  deployable: boolean;
  deployableUnits: number;
}

export interface InventoryItemCollection {
  items: InventoryItem[];
  source: "dev-memory";
  total: number;
}

export interface InventoryUnit {
  unitId: number;
  itemId: number;
  unitLabel: string;
  serialNumber: string | null;
  assetTag: string | null;
  status: string;
  location: string | null;
  currentBuildId: number | null;
  latestEventId: number | null;
  metadataJson: JsonObject;
  createdAt: TimestampIsoString;
  updatedAt: TimestampIsoString;
  sourceKind: string;
  deployable: boolean;
}

export interface InventoryUnitCollection {
  units: InventoryUnit[];
  source: "dev-memory";
  total: number;
}

export interface InventoryBuild {
  buildId: number;
  buildName: string;
  buildKind: string;
  status: string;
  baseUnitId: number | null;
  roverUnitId: number | null;
  reservedByAccountId: number | null;
  runtimeDeviceId: string | null;
  currentTaskId: number | null;
  expectedSite: string | null;
  planJson: JsonObject;
  resultJson: JsonObject;
  latestEventId: number | null;
  createdAt: TimestampIsoString;
  updatedAt: TimestampIsoString;
  latestDeploymentRunId: number | null;
  deploymentSummaryJson: JsonObject;
}

export interface InventoryBuildCollection {
  builds: InventoryBuild[];
  source: "dev-memory";
  total: number;
}

export interface InventoryEvent {
  eventId: number;
  subjectKind: string;
  subjectId: number;
  eventKind: string;
  payloadJson: JsonObject;
  actor: string | null;
  agentTaskId: number | null;
  createdAt: TimestampIsoString;
}

export interface InventoryEventCollection {
  events: InventoryEvent[];
  source: "dev-memory";
  total: number;
}

export interface HardwareDeploymentRun {
  deploymentRunId: number;
  buildId: number;
  deploymentKind: string;
  hardwareFamily: string;
  targetUnitId: number | null;
  benchHost: string | null;
  status: string;
  requestedByAccountId: string | null;
  summaryJson: JsonObject;
  latestEventId: number | null;
  createdAt: TimestampIsoString;
  updatedAt: TimestampIsoString;
  completedAt: TimestampIsoString | null;
}

export interface HardwareDeploymentStep {
  deploymentStepId: number;
  deploymentRunId: number;
  sequenceIndex: number;
  stepKind: string;
  displayLabel: string;
  executionMode: string;
  status: string;
  required: boolean;
  taskKind: string | null;
  agentTaskId: number | null;
  payloadJson: JsonObject;
  resultJson: JsonObject;
  createdAt: TimestampIsoString;
  updatedAt: TimestampIsoString;
  completedAt: TimestampIsoString | null;
}

export interface HardwarePortProbe {
  hostProbeId: number;
  deploymentRunId: number;
  probeKind: string;
  status: string;
  detailJson: JsonObject;
  createdAt: TimestampIsoString;
}

export interface HardwareToolStatus {
  hardwareToolStatusId: number;
  deploymentRunId: number;
  toolName: string;
  status: string;
  version: string | null;
  detailJson: JsonObject;
  createdAt: TimestampIsoString;
}

export interface HardwareDeploymentRunCollection {
  runs: HardwareDeploymentRun[];
  source: "dev-memory";
  total: number;
}

export interface HardwareDeploymentRunDetail {
  run: HardwareDeploymentRun;
  steps: HardwareDeploymentStep[];
  probes: HardwarePortProbe[];
  toolStatuses: HardwareToolStatus[];
}

export interface PresentationDeckSource {
  deckKey: string;
  title: string;
  markdownPath: string;
  companionPath: string | null;
  summary: string;
  hasPreviewCompanion: boolean;
  slideCount: number;
  updatedAt: TimestampIsoString;
  tags: string[];
}

export interface PresentationDeckSourceCollection {
  items: PresentationDeckSource[];
  source: "filesystem";
  total: number;
}

export interface PreviewRun {
  previewRunId: number;
  deckKey: string;
  title: string;
  markdownPath: string;
  companionPath: string | null;
  status: string;
  browser: string;
  viewportJson: JsonObject;
  currentTaskId: number | null;
  renderTaskId: number | null;
  analyzeTaskId: number | null;
  manifestJson: JsonObject;
  renderSummaryJson: JsonObject;
  analysisSummaryJson: JsonObject;
  createdAt: TimestampIsoString;
  updatedAt: TimestampIsoString;
  completedAt: TimestampIsoString | null;
}

export interface PreviewRunCollection {
  runs: PreviewRun[];
  source: "dev-memory";
  total: number;
}

export interface PreviewFeedback {
  previewFeedbackId: number;
  previewRunId: number;
  slideId: string | null;
  feedbackKind: string;
  comment: string;
  payloadJson: JsonObject;
  createdByAccountId: string | null;
  createdAt: TimestampIsoString;
}

export interface PreviewFeedbackCollection {
  items: PreviewFeedback[];
  source: "dev-memory";
  total: number;
}

export interface UiReviewRun {
  uiReviewRunId: number;
  surface: string;
  scenarioSet: string;
  status: string;
  baseUrl: string;
  browser: string;
  viewportJson: JsonObject;
  currentTaskId: number | null;
  captureTaskId: number | null;
  analyzeTaskId: number | null;
  fixDraftTaskId: number | null;
  manifestJson: JsonObject;
  captureSummaryJson: JsonObject;
  analysisSummaryJson: JsonObject;
  createdAt: TimestampIsoString;
  updatedAt: TimestampIsoString;
  completedAt: TimestampIsoString | null;
}

export interface UiReviewRunCollection {
  runs: UiReviewRun[];
  source: "dev-memory";
  total: number;
}

export interface UiReviewFinding {
  uiReviewFindingId: number;
  uiReviewRunId: number;
  category: string;
  severity: string;
  status: string;
  title: string;
  summary: string;
  scenarioName: string | null;
  checkpointName: string | null;
  evidenceJson: JsonObject;
  analyzerJson: JsonObject;
  fixDraftJson: JsonObject;
  reviewedByAccountId: string | null;
  reviewedAt: TimestampIsoString | null;
  createdAt: TimestampIsoString;
}

export interface UiReviewFindingCollection {
  findings: UiReviewFinding[];
  source: "dev-memory";
  total: number;
}

export interface UiReviewBaseline {
  uiReviewBaselineId: number;
  surface: string;
  scenarioName: string;
  checkpointName: string;
  browser: string;
  viewportKey: string;
  relativePath: string;
  status: string;
  sourceRunId: number | null;
  approvedByAccountId: string | null;
  metadataJson: JsonObject;
  createdAt: TimestampIsoString;
  supersededAt: TimestampIsoString | null;
}

export interface UiReviewBaselineCollection {
  baselines: UiReviewBaseline[];
  source: "dev-memory";
  total: number;
}

export interface InventoryBuildStartResponse {
  build: InventoryBuild;
  tasks: AgentTaskRecord[];
}

export interface InventoryRuntimePublishResponse {
  build: InventoryBuild;
  task: AgentTaskRecord;
}

export interface HardwareDeploymentMutationResponse {
  deployment: HardwareDeploymentRunDetail;
  task: AgentTaskRecord | null;
}

export interface SeedInventoryResponse {
  upsertedItems: number;
  upsertedUnits: number;
  source: string;
  skippedRows: number;
}

export interface AgentEventRecord {
  agentEventId: number;
  agentRunId: number;
  eventType: string;
  payload: JsonObject;
  createdAt: TimestampIsoString;
}

export interface AgentArtifactRecord {
  artifactId: number;
  agentRunId: number;
  artifactKind: string;
  uri: string;
  metadata: JsonObject;
  createdAt: TimestampIsoString;
}

export interface AgentRunDetail {
  run: AgentRunRecord;
  task: AgentTaskRecord | null;
  dependencies: AgentTaskDependency[];
  events: AgentEventRecord[];
  artifacts: AgentArtifactRecord[];
  source: "dev-memory" | "unconfigured";
}

export interface DocsCatalogItem {
  path: string;
  title: string;
  kind: string;
  summary: string;
  updatedAt: TimestampIsoString;
  tags: string[];
}

export interface DocsCatalogResponse {
  items: DocsCatalogItem[];
  source: CatalogSource;
}

export interface SkillDescriptor {
  skillId: string;
  name: string;
  description: string;
  path: string;
  source: "repo" | "system";
  available: boolean;
}

export interface SkillCatalogResponse {
  items: SkillDescriptor[];
  source: CatalogSource;
}

export interface DevPreferenceSignal {
  devPreferenceSignalId: number;
  runtimeAccountId: AccountId;
  signalKind: string;
  surface: string;
  panelKey: string | null;
  payload: JsonObject;
  createdAt: TimestampIsoString;
}

export interface DevPreferenceDecision {
  devPreferenceDecisionId: number;
  runtimeAccountId: AccountId;
  devPreferenceSignalId: number | null;
  decisionKind: string;
  subjectKind: string;
  subjectKey: string;
  chosenValue: string | null;
  payload: JsonObject;
  createdAt: TimestampIsoString;
}

export interface DevPreferenceScore {
  runtimeAccountId: AccountId;
  featureSummary: JsonObject;
  scorecard: JsonObject;
  computedFromSignalCount: number;
  updatedAt: TimestampIsoString;
}

export interface DevPreferenceProfile {
  score: DevPreferenceScore | null;
  recentSignals: DevPreferenceSignal[];
  recentDecisions: DevPreferenceDecision[];
  source: "dev-memory" | "unconfigured";
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

export interface KnowledgeClaimSearchResult {
  knowledgeClaimId: number;
  sourceDocumentId: number | null;
  summary: string;
  status: string;
  tags: JsonValue[];
  createdAt: TimestampIsoString;
  sourceTitle: string | null;
  sourceUri: string | null;
  lexicalScore: number;
  semanticScore: number;
  combinedScore: number;
  matchReasons: string[];
}

export interface KnowledgeClaimSearchResponse {
  items: KnowledgeClaimSearchResult[];
  source: "dev-memory" | "unconfigured";
  query: string;
  mode: "lexical" | "vector" | "hybrid";
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

export interface RuntimeSessionState {
  authenticated: boolean;
  me: AuthenticatedMe | null;
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
