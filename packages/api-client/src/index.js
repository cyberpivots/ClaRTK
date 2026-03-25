export class ApiClient {
    options;
    constructor(options) {
        this.options = options;
    }
    url(path) {
        return new URL(path, this.options.baseUrl).toString();
    }
}
