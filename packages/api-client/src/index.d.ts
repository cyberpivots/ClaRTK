export interface ApiClientOptions {
    baseUrl: string;
}
export declare class ApiClient {
    private readonly options;
    constructor(options: ApiClientOptions);
    url(path: string): string;
}
