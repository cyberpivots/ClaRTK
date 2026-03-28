import type {
  Account,
  AgentRunCollection,
  AgentRunDetail,
  AgentTaskCollection,
  AgentTaskRecord,
  ApiTokenCreateResult,
  AuthRole,
  AuthSessionResult,
  AuthenticatedMe,
  DevCoordinatorStatus,
  DevConsoleApiHealth,
  DevPreferenceProfile,
  DevPreferenceSignal,
  DocsCatalogResponse,
  HardwareDeploymentMutationResponse,
  HardwareDeploymentRunCollection,
  HardwareDeploymentRunDetail,
  InventoryBuild,
  InventoryBuildCollection,
  InventoryBuildStartResponse,
  InventoryEventCollection,
  InventoryItem,
  InventoryItemCollection,
  InventoryRuntimePublishResponse,
  InventoryUnit,
  InventoryUnitCollection,
  PresentationDeckSourceCollection,
  PreviewFeedback,
  PreviewFeedbackCollection,
  PreviewRun,
  PreviewRunCollection,
  UiReviewBaselineCollection,
  UiReviewFinding,
  UiReviewFindingCollection,
  UiReviewRun,
  UiReviewRunCollection,
  SeedInventoryResponse,
  EffectiveOperatorProfile,
  EvaluationResultRecord,
  JsonObject,
  KnowledgeClaimRecord,
  KnowledgeClaimSearchResponse,
  MyViewsResponse,
  PreferenceObservationResult,
  PreferenceSuggestion,
  PreferenceSuggestionCollection,
  ResourceCollection,
  RuntimeApiHealth,
  RuntimeDevice,
  RuntimePositionEvent,
  RuntimeRtkSolution,
  RuntimeSessionState,
  RuntimeSavedView,
  SkillCatalogResponse,
  SourceDocumentRecord,
  SuggestionPublishResult,
  SuggestionReviewOutcome,
  ViewOverride,
  WorkspaceOverview
} from "@clartk/domain";

export interface ApiClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

class JsonClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: ApiClientOptions) {
    this.fetchFn =
      options.fetchFn ??
      ((input, init) => {
        return globalThis.fetch(input, init);
      });
  }

  url(path: string): string {
    return new URL(path, this.options.baseUrl).toString();
  }

  protected async getJson<T>(path: string): Promise<T> {
    return this.sendJson<T>(path, {
      method: "GET"
    });
  }

  protected async sendJson<T>(
    path: string,
    init: {
      method: string;
      body?: unknown;
      headers?: HeadersInit;
    }
  ): Promise<T> {
    const response = await this.fetchFn(this.url(path), {
      method: init.method,
      credentials: "include",
      headers: {
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init.headers
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });

    if (!response.ok) {
      let detail = "";
      try {
        const payload = (await response.json()) as { error?: string };
        detail = payload.error ? ` ${payload.error}` : "";
      } catch {
        detail = "";
      }
      throw new Error(`request failed for ${path}: ${response.status}${detail}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

export class ApiClient extends JsonClient {
  healthUrl(): string {
    return this.url("/health");
  }

  devicesUrl(): string {
    return this.url("/v1/devices");
  }

  positionsUrl(): string {
    return this.url("/v1/telemetry/positions");
  }

  solutionsUrl(): string {
    return this.url("/v1/rtk/solutions");
  }

  savedViewsUrl(): string {
    return this.url("/v1/ui/views");
  }

  myProfileUrl(): string {
    return this.url("/v1/me/profile");
  }

  myViewsUrl(): string {
    return this.url("/v1/me/views");
  }

  suggestionsUrl(): string {
    return this.url("/v1/me/suggestions");
  }

  provisionalResourceUrls(): string[] {
    return [
      this.healthUrl(),
      this.devicesUrl(),
      this.positionsUrl(),
      this.solutionsUrl(),
      this.savedViewsUrl()
    ];
  }

  async getHealth(): Promise<RuntimeApiHealth> {
    return this.getJson<RuntimeApiHealth>("/health");
  }

  async listDevices(): Promise<ResourceCollection<RuntimeDevice>> {
    return this.getJson<ResourceCollection<RuntimeDevice>>("/v1/devices");
  }

  async listPositions(): Promise<ResourceCollection<RuntimePositionEvent>> {
    return this.getJson<ResourceCollection<RuntimePositionEvent>>("/v1/telemetry/positions");
  }

  async listSolutions(): Promise<ResourceCollection<RuntimeRtkSolution>> {
    return this.getJson<ResourceCollection<RuntimeRtkSolution>>("/v1/rtk/solutions");
  }

  async listSavedViews(): Promise<ResourceCollection<RuntimeSavedView>> {
    return this.getJson<ResourceCollection<RuntimeSavedView>>("/v1/ui/views");
  }

  async bootstrapLocalAccount(payload: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<AuthSessionResult> {
    return this.sendJson<AuthSessionResult>("/v1/auth/bootstrap", {
      method: "POST",
      body: payload
    });
  }

  async login(payload: { email: string; password: string }): Promise<AuthSessionResult> {
    return this.sendJson<AuthSessionResult>("/v1/auth/login", {
      method: "POST",
      body: payload
    });
  }

  async logout(): Promise<void> {
    await this.sendJson<void>("/v1/auth/logout", {
      method: "POST"
    });
  }

  async getSessionState(): Promise<RuntimeSessionState> {
    return this.getJson<RuntimeSessionState>("/v1/auth/session");
  }

  async getMe(): Promise<AuthenticatedMe> {
    return this.getJson<AuthenticatedMe>("/v1/me");
  }

  async createApiToken(label: string): Promise<ApiTokenCreateResult> {
    return this.sendJson<ApiTokenCreateResult>("/v1/auth/tokens", {
      method: "POST",
      body: { label }
    });
  }

  async revokeApiToken(tokenId: string): Promise<void> {
    await this.sendJson<void>(`/v1/auth/tokens/${encodeURIComponent(tokenId)}`, {
      method: "DELETE"
    });
  }

  async getProfile(viewId?: number): Promise<EffectiveOperatorProfile> {
    const path = viewId === undefined ? "/v1/me/profile" : `/v1/me/profile?viewId=${viewId}`;
    return this.getJson<EffectiveOperatorProfile>(path);
  }

  async patchProfile(defaultsPatch: JsonObject): Promise<EffectiveOperatorProfile> {
    return this.sendJson<EffectiveOperatorProfile>("/v1/me/profile", {
      method: "PATCH",
      body: { defaultsPatch }
    });
  }

  async listMyViews(): Promise<MyViewsResponse> {
    return this.getJson<MyViewsResponse>("/v1/me/views");
  }

  async createViewOverride(payload: {
    name: string;
    contextKey?: string | null;
    layout?: JsonObject;
    overridePayload?: JsonObject;
  }): Promise<ViewOverride> {
    return this.sendJson<ViewOverride>("/v1/me/views", {
      method: "POST",
      body: payload
    });
  }

  async updateViewOverride(
    savedViewId: number,
    payload: {
      name?: string;
      contextKey?: string | null;
      layout?: JsonObject;
      overridePayload?: JsonObject;
    }
  ): Promise<ViewOverride> {
    return this.sendJson<ViewOverride>(`/v1/me/views/${savedViewId}`, {
      method: "PATCH",
      body: payload
    });
  }

  async recordPreferenceObservation(payload: {
    eventKind: string;
    signature: string;
    suggestionKind: string;
    candidatePatch?: JsonObject;
    payload?: JsonObject;
    basedOnProfileVersion?: number;
  }): Promise<PreferenceObservationResult> {
    return this.sendJson<PreferenceObservationResult>("/v1/me/preference-observations", {
      method: "POST",
      body: payload
    });
  }

  async listSuggestions(accountId?: string): Promise<PreferenceSuggestionCollection> {
    const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
    return this.getJson<PreferenceSuggestionCollection>(`/v1/me/suggestions${query}`);
  }

  async reviewSuggestion(
    suggestionId: number,
    outcome: SuggestionReviewOutcome,
    notes?: string,
    accountId?: string
  ): Promise<PreferenceSuggestion> {
    return this.sendJson<PreferenceSuggestion>(`/v1/me/suggestions/${suggestionId}/review`, {
      method: "POST",
      body: { outcome, notes, accountId }
    });
  }

  async publishSuggestion(suggestionId: number, accountId?: string): Promise<SuggestionPublishResult> {
    return this.sendJson<SuggestionPublishResult>(`/v1/me/suggestions/${suggestionId}/publish`, {
      method: "POST",
      body: { accountId }
    });
  }

  async listAccounts(): Promise<ResourceCollection<Account>> {
    return this.getJson<ResourceCollection<Account>>("/v1/admin/accounts");
  }

  async createAccount(payload: {
    email: string;
    password: string;
    displayName: string;
    role: AuthRole;
  }): Promise<Account> {
    return this.sendJson<Account>("/v1/admin/accounts", {
      method: "POST",
      body: payload
    });
  }
}

export class DevConsoleClient extends JsonClient {
  async getHealth(): Promise<DevConsoleApiHealth> {
    return this.getJson<DevConsoleApiHealth>("/health");
  }

  async getWorkspaceOverview(): Promise<WorkspaceOverview> {
    return this.getJson<WorkspaceOverview>("/v1/workspace/overview");
  }

  async getCoordinatorStatus(): Promise<DevCoordinatorStatus> {
    return this.getJson<DevCoordinatorStatus>("/v1/workspace/coordinator-status");
  }

  async listTasks(queueName?: string): Promise<AgentTaskCollection> {
    const query = queueName ? `?queueName=${encodeURIComponent(queueName)}` : "";
    return this.getJson<AgentTaskCollection>(`/v1/coordination/tasks${query}`);
  }

  async enqueueTask(payload: {
    taskKind: string;
    queueName?: string;
    priority?: number;
    payload?: JsonObject;
  }): Promise<AgentTaskRecord> {
    return this.sendJson<AgentTaskRecord>("/v1/coordination/tasks/enqueue", {
      method: "POST",
      body: payload
    });
  }

  async retryTask(agentTaskId: number, note?: string): Promise<AgentTaskRecord> {
    return this.sendJson<AgentTaskRecord>(`/v1/coordination/tasks/${agentTaskId}/retry`, {
      method: "POST",
      body: { note }
    });
  }

  async listRuns(limit?: number): Promise<AgentRunCollection> {
    const query = limit === undefined ? "" : `?limit=${limit}`;
    return this.getJson<AgentRunCollection>(`/v1/coordination/runs${query}`);
  }

  async getRun(agentRunId: number): Promise<AgentRunDetail> {
    return this.getJson<AgentRunDetail>(`/v1/coordination/runs/${agentRunId}`);
  }

  previewAssetUrl(relativePath: string): string {
    const url = new URL("/v1/previews/assets", this.url("/"));
    url.searchParams.set("path", relativePath);
    return url.toString();
  }

  uiReviewAssetUrl(relativePath: string): string {
    const url = new URL("/v1/reviews/ui/assets", this.url("/"));
    url.searchParams.set("path", relativePath);
    return url.toString();
  }

  async listPreviewDecks(): Promise<PresentationDeckSourceCollection> {
    return this.getJson<PresentationDeckSourceCollection>("/v1/previews/decks");
  }

  async listPreviewRuns(query: { limit?: number } = {}): Promise<PreviewRunCollection> {
    const params = new URLSearchParams();
    if (typeof query.limit === "number") {
      params.set("limit", String(query.limit));
    }
    const suffix = params.toString();
    const route = suffix ? `/v1/previews/runs?${suffix}` : "/v1/previews/runs";
    return this.getJson<PreviewRunCollection>(route);
  }

  async getPreviewRun(previewRunId: number): Promise<PreviewRun> {
    return this.getJson<PreviewRun>(`/v1/previews/runs/${previewRunId}`);
  }

  async startPreviewRun(payload: {
    deckKey: string;
    queueName?: string;
    priority?: number;
    viewportJson?: JsonObject;
  }): Promise<PreviewRun> {
    return this.sendJson<PreviewRun>("/v1/previews/runs", {
      method: "POST",
      body: payload
    });
  }

  async listPreviewFeedback(query: {
    previewRunId?: number;
    slideId?: string;
    limit?: number;
  } = {}): Promise<PreviewFeedbackCollection> {
    const params = new URLSearchParams();
    if (typeof query.previewRunId === "number") {
      params.set("previewRunId", String(query.previewRunId));
    }
    if (typeof query.slideId === "string" && query.slideId) {
      params.set("slideId", query.slideId);
    }
    if (typeof query.limit === "number") {
      params.set("limit", String(query.limit));
    }
    const suffix = params.toString();
    const route = suffix ? `/v1/previews/feedback?${suffix}` : "/v1/previews/feedback";
    return this.getJson<PreviewFeedbackCollection>(route);
  }

  async createPreviewFeedback(payload: {
    previewRunId: number;
    slideId?: string | null;
    feedbackKind: string;
    comment?: string;
    payload?: JsonObject;
  }): Promise<PreviewFeedback> {
    return this.sendJson<PreviewFeedback>(`/v1/previews/runs/${payload.previewRunId}/feedback`, {
      method: "POST",
      body: {
        slideId: payload.slideId,
        feedbackKind: payload.feedbackKind,
        comment: payload.comment,
        payload: payload.payload
      }
    });
  }

  async listUiReviewRuns(query: { surface?: string; limit?: number } = {}): Promise<UiReviewRunCollection> {
    const params = new URLSearchParams();
    if (typeof query.surface === "string" && query.surface) {
      params.set("surface", query.surface);
    }
    if (typeof query.limit === "number") {
      params.set("limit", String(query.limit));
    }
    const suffix = params.toString();
    const route = suffix ? `/v1/reviews/ui/runs?${suffix}` : "/v1/reviews/ui/runs";
    return this.getJson<UiReviewRunCollection>(route);
  }

  async getUiReviewRun(uiReviewRunId: number): Promise<UiReviewRun> {
    return this.getJson<UiReviewRun>(`/v1/reviews/ui/runs/${uiReviewRunId}`);
  }

  async startUiReview(payload: {
    surface?: string;
    scenarioSet?: string;
    baseUrl?: string;
    recordVideo?: boolean;
    queueName?: string;
    priority?: number;
    viewportJson?: JsonObject;
    manifestJson?: JsonObject;
  }): Promise<UiReviewRun> {
    return this.sendJson<UiReviewRun>("/v1/reviews/ui/runs", {
      method: "POST",
      body: payload
    });
  }

  async listUiReviewFindings(query: {
    uiReviewRunId?: number;
    status?: string;
    limit?: number;
  } = {}): Promise<UiReviewFindingCollection> {
    const params = new URLSearchParams();
    if (typeof query.uiReviewRunId === "number") {
      params.set("uiReviewRunId", String(query.uiReviewRunId));
    }
    if (typeof query.status === "string" && query.status) {
      params.set("status", query.status);
    }
    if (typeof query.limit === "number") {
      params.set("limit", String(query.limit));
    }
    const suffix = params.toString();
    const route = suffix ? `/v1/reviews/ui/findings?${suffix}` : "/v1/reviews/ui/findings";
    return this.getJson<UiReviewFindingCollection>(route);
  }

  async reviewUiFinding(payload: {
    findingId: number;
    status: string;
    reviewPayload?: JsonObject;
  }): Promise<UiReviewFinding> {
    return this.sendJson<UiReviewFinding>(`/v1/reviews/ui/findings/${payload.findingId}/review`, {
      method: "POST",
      body: {
        status: payload.status,
        reviewPayload: payload.reviewPayload
      }
    });
  }

  async listUiReviewBaselines(query: {
    surface?: string;
    status?: string;
    limit?: number;
  } = {}): Promise<UiReviewBaselineCollection> {
    const params = new URLSearchParams();
    if (typeof query.surface === "string" && query.surface) {
      params.set("surface", query.surface);
    }
    if (typeof query.status === "string" && query.status) {
      params.set("status", query.status);
    }
    if (typeof query.limit === "number") {
      params.set("limit", String(query.limit));
    }
    const suffix = params.toString();
    const route = suffix ? `/v1/reviews/ui/baselines?${suffix}` : "/v1/reviews/ui/baselines";
    return this.getJson<UiReviewBaselineCollection>(route);
  }

  async promoteUiReviewBaseline(payload: {
    uiReviewRunId: number;
    queueName?: string;
    priority?: number;
  }): Promise<UiReviewRun> {
    return this.sendJson<UiReviewRun>(
      `/v1/reviews/ui/runs/${payload.uiReviewRunId}/promote-baseline`,
      {
        method: "POST",
        body: {
          queueName: payload.queueName,
          priority: payload.priority
        }
      }
    );
  }

  async listSourceDocuments(): Promise<ResourceCollection<SourceDocumentRecord>> {
    return this.getJson<ResourceCollection<SourceDocumentRecord>>("/v1/knowledge/source-documents");
  }

  async listClaims(): Promise<ResourceCollection<KnowledgeClaimRecord>> {
    return this.getJson<ResourceCollection<KnowledgeClaimRecord>>("/v1/knowledge/claims");
  }

  async searchClaims(
    query: string,
    mode: "lexical" | "vector" | "hybrid" = "hybrid",
    limit?: number
  ): Promise<KnowledgeClaimSearchResponse> {
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("mode", mode);
    if (typeof limit === "number") {
      params.set("limit", String(limit));
    }
    return this.getJson<KnowledgeClaimSearchResponse>(
      `/v1/knowledge/claims/search?${params.toString()}`
    );
  }

  async listEvaluations(): Promise<ResourceCollection<EvaluationResultRecord>> {
    return this.getJson<ResourceCollection<EvaluationResultRecord>>("/v1/evaluations");
  }

  async listDocsCatalog(): Promise<DocsCatalogResponse> {
    return this.getJson<DocsCatalogResponse>("/v1/docs/catalog");
  }

  async listSkills(): Promise<SkillCatalogResponse> {
    return this.getJson<SkillCatalogResponse>("/v1/skills");
  }

  async getRuntimeProfileSummary(): Promise<AuthenticatedMe> {
    return this.getJson<AuthenticatedMe>("/v1/preferences/runtime-profile-summary");
  }

  async getDevProfile(): Promise<DevPreferenceProfile> {
    return this.getJson<DevPreferenceProfile>("/v1/preferences/dev-profile");
  }

  async listInventoryItems(query: {
    status?: string;
    sourceKind?: string;
    onlyDeployable?: boolean;
    limit?: number;
  } = {}): Promise<InventoryItemCollection> {
    const params = new URLSearchParams();
    if (typeof query.status === "string" && query.status) {
      params.set("status", query.status);
    }
    if (typeof query.sourceKind === "string" && query.sourceKind) {
      params.set("sourceKind", query.sourceKind);
    }
    if (query.onlyDeployable === true) {
      params.set("onlyDeployable", "true");
    }
    if (typeof query.limit === "number") {
      params.set("limit", String(query.limit));
    }
    const suffix = params.toString();
    const path = suffix ? `/v1/inventory/items?${suffix}` : "/v1/inventory/items";
    return this.getJson<InventoryItemCollection>(path);
  }

  async getInventoryItem(itemId: number): Promise<InventoryItem> {
    return this.getJson<InventoryItem>(`/v1/inventory/items/${itemId}`);
  }

  async listInventoryUnits(query: {
    itemId?: number;
    status?: string;
    buildId?: number;
    sourceKind?: string;
    onlyDeployable?: boolean;
    limit?: number;
  } = {}): Promise<InventoryUnitCollection> {
    const params = new URLSearchParams();
    if (typeof query.itemId === "number") {
      params.set("itemId", String(query.itemId));
    }
    if (typeof query.status === "string" && query.status) {
      params.set("status", query.status);
    }
    if (typeof query.buildId === "number") {
      params.set("buildId", String(query.buildId));
    }
    if (typeof query.sourceKind === "string" && query.sourceKind) {
      params.set("sourceKind", query.sourceKind);
    }
    if (query.onlyDeployable === true) {
      params.set("onlyDeployable", "true");
    }
    if (typeof query.limit === "number") {
      params.set("limit", String(query.limit));
    }
    const querySuffix = params.toString();
    const path = querySuffix ? `/v1/inventory/units?${querySuffix}` : "/v1/inventory/units";
    return this.getJson<InventoryUnitCollection>(path);
  }

  async getInventoryUnit(unitId: number): Promise<InventoryUnit> {
    return this.getJson<InventoryUnit>(`/v1/inventory/units/${unitId}`);
  }

  async listInventoryBuilds(query: {
    status?: string;
    buildKind?: string;
    limit?: number;
  } = {}): Promise<InventoryBuildCollection> {
    const params = new URLSearchParams();
    if (typeof query.status === "string" && query.status) {
      params.set("status", query.status);
    }
    if (typeof query.buildKind === "string" && query.buildKind) {
      params.set("buildKind", query.buildKind);
    }
    if (typeof query.limit === "number") {
      params.set("limit", String(query.limit));
    }
    const querySuffix = params.toString();
    const path = querySuffix ? `/v1/inventory/builds?${querySuffix}` : "/v1/inventory/builds";
    return this.getJson<InventoryBuildCollection>(path);
  }

  async getInventoryBuild(buildId: number): Promise<InventoryBuild> {
    return this.getJson<InventoryBuild>(`/v1/inventory/builds/${buildId}`);
  }

  async listInventoryEvents(query: {
    subjectKind?: string;
    subjectId?: number;
    limit?: number;
  } = {}): Promise<InventoryEventCollection> {
    const params = new URLSearchParams();
    if (typeof query.subjectKind === "string" && query.subjectKind) {
      params.set("subjectKind", query.subjectKind);
    }
    if (typeof query.subjectId === "number") {
      params.set("subjectId", String(query.subjectId));
    }
    if (typeof query.limit === "number") {
      params.set("limit", String(query.limit));
    }
    const querySuffix = params.toString();
    const path = querySuffix ? `/v1/inventory/events?${querySuffix}` : "/v1/inventory/events";
    return this.getJson<InventoryEventCollection>(path);
  }

  async startInventoryBuild(payload: {
    buildName: string;
    buildKind: string;
    baseUnitId: number;
    roverUnitId: number;
    queueName?: string;
    priority?: number;
    expectedSite?: string;
    planJson?: JsonObject;
  }): Promise<InventoryBuildStartResponse> {
    return this.sendJson<InventoryBuildStartResponse>("/v1/inventory/builds", {
      method: "POST",
      body: payload
    });
  }

  async triggerInventoryRuntimePublish(payload: {
    buildId: number;
    runtimeDeviceId: string;
    queueName?: string;
    priority?: number;
  }): Promise<InventoryRuntimePublishResponse> {
    return this.sendJson<InventoryRuntimePublishResponse>(
      `/v1/inventory/builds/${payload.buildId}/runtime-publish`,
      {
        method: "POST",
        body: {
          runtimeDeviceId: payload.runtimeDeviceId,
          queueName: payload.queueName,
          priority: payload.priority
        }
      }
    );
  }

  async listHardwareDeployments(query: {
    buildId?: number;
    limit?: number;
  } = {}): Promise<HardwareDeploymentRunCollection> {
    const params = new URLSearchParams();
    if (typeof query.buildId === "number") {
      params.set("buildId", String(query.buildId));
    }
    if (typeof query.limit === "number") {
      params.set("limit", String(query.limit));
    }
    const suffix = params.toString();
    const path = suffix ? `/v1/inventory/deployments?${suffix}` : "/v1/inventory/deployments";
    return this.getJson<HardwareDeploymentRunCollection>(path);
  }

  async getHardwareDeployment(deploymentRunId: number): Promise<HardwareDeploymentRunDetail> {
    return this.getJson<HardwareDeploymentRunDetail>(`/v1/inventory/deployments/${deploymentRunId}`);
  }

  async startHardwareDeployment(payload: {
    buildId: number;
    deploymentKind: string;
    targetUnitId?: number;
    benchHost?: string;
    queueName?: string;
    priority?: number;
  }): Promise<HardwareDeploymentMutationResponse> {
    return this.sendJson<HardwareDeploymentMutationResponse>("/v1/inventory/deployments", {
      method: "POST",
      body: payload
    });
  }

  async resumeHardwareDeployment(payload: {
    deploymentRunId: number;
    queueName?: string;
    priority?: number;
  }): Promise<HardwareDeploymentMutationResponse> {
    return this.sendJson<HardwareDeploymentMutationResponse>(
      `/v1/inventory/deployments/${payload.deploymentRunId}/resume`,
      {
        method: "POST",
        body: {
          queueName: payload.queueName,
          priority: payload.priority
        }
      }
    );
  }

  async completeHardwareDeploymentStep(payload: {
    deploymentRunId: number;
    deploymentStepId: number;
    completionNote?: string;
    payloadJson?: JsonObject;
  }): Promise<HardwareDeploymentMutationResponse> {
    return this.sendJson<HardwareDeploymentMutationResponse>(
      `/v1/inventory/deployments/${payload.deploymentRunId}/steps/${payload.deploymentStepId}/complete`,
      {
        method: "POST",
        body: {
          completionNote: payload.completionNote,
          payloadJson: payload.payloadJson
        }
      }
    );
  }

  async cancelHardwareDeployment(payload: {
    deploymentRunId: number;
    reason?: string;
  }): Promise<HardwareDeploymentMutationResponse> {
    return this.sendJson<HardwareDeploymentMutationResponse>(
      `/v1/inventory/deployments/${payload.deploymentRunId}/cancel`,
      {
        method: "POST",
        body: {
          reason: payload.reason
        }
      }
    );
  }

  async seedInventory(manifestPath: string, force = false): Promise<SeedInventoryResponse> {
    return this.sendJson<SeedInventoryResponse>("/v1/inventory/seed", {
      method: "POST",
      body: {
        manifestPath,
        force
      }
    });
  }

  async createDevPreferenceSignal(payload: {
    signalKind: string;
    surface?: string;
    panelKey?: string | null;
    payload?: JsonObject;
  }): Promise<DevPreferenceSignal> {
    return this.sendJson<DevPreferenceSignal>("/v1/preferences/signals", {
      method: "POST",
      body: payload
    });
  }

  async createDevPreferenceDecision(payload: {
    devPreferenceSignalId?: number | null;
    decisionKind: string;
    subjectKind: string;
    subjectKey: string;
    chosenValue?: string | null;
    payload?: JsonObject;
  }): Promise<DevPreferenceProfile> {
    return this.sendJson<DevPreferenceProfile>("/v1/preferences/decisions", {
      method: "POST",
      body: payload
    });
  }
}
