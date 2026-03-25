export interface ApiClientOptions {
  baseUrl: string;
}

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  url(path: string): string {
    return new URL(path, this.options.baseUrl).toString();
  }
}

