import type {
  ResourceCollection,
  RuntimeApiHealth,
  RuntimeDevice,
  RuntimePositionEvent,
  RuntimeRtkSolution,
  RuntimeSavedView
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

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.fetchFn(this.url(path));
    if (!response.ok) {
      throw new Error(`request failed for ${path}: ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
