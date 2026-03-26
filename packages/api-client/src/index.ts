import type {
  Account,
  ApiTokenCreateResult,
  AuthRole,
  AuthSessionResult,
  AuthenticatedMe,
  EffectiveOperatorProfile,
  JsonObject,
  MyViewsResponse,
  PreferenceObservationResult,
  PreferenceSuggestion,
  PreferenceSuggestionCollection,
  RuntimeApiHealth,
  ResourceCollection,
  RuntimeDevice,
  RuntimePositionEvent,
  RuntimeRtkSolution,
  RuntimeSavedView,
  SuggestionPublishResult,
  SuggestionReviewOutcome,
  ViewOverride
} from "@clartk/domain";

export interface ApiClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

export class ApiClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: ApiClientOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  url(path: string): string {
    return new URL(path, this.options.baseUrl).toString();
  }

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
    const payload = {
      outcome,
      notes,
      accountId
    };
    return this.sendJson<PreferenceSuggestion>(`/v1/me/suggestions/${suggestionId}/review`, {
      method: "POST",
      body: payload
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

  private async getJson<T>(path: string): Promise<T> {
    return this.sendJson<T>(path, {
      method: "GET"
    });
  }

  private async sendJson<T>(
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
