import type { CrudAdapter, RestRequest, RestTransport } from "./contracts";

function identity<TValue>(value: TValue): TValue {
  return value;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function resolvePath(path: string | (() => string)): string {
  return typeof path === "function" ? path() : path;
}

function withBody<TBody>(
  method: "POST" | "PUT",
  path: string,
  body: TBody | undefined,
): RestRequest<TBody> {
  if (body === undefined) {
    return {
      method,
      path,
    };
  }

  return {
    body,
    method,
    path,
  };
}

export interface FetchRestTransportOptions {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  fetch?: typeof fetch;
}

export class FetchRestTransport implements RestTransport {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(private readonly options: FetchRestTransportOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetchImpl = options.fetch ?? fetch;
  }

  public async request<TResult, TBody = unknown>(
    request: RestRequest<TBody>,
  ): Promise<TResult> {
    const url = new URL(request.path.replace(/^\//, ""), this.baseUrl);
    if (request.query) {
      for (const [key, value] of Object.entries(request.query)) {
        if (value === undefined || value === null) {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    const headers = new Headers(this.options.defaultHeaders);
    if (request.headers) {
      for (const [key, value] of Object.entries(request.headers)) {
        headers.set(key, value);
      }
    }

    const init: RequestInit = {
      method: request.method,
      headers,
    };

    if (request.body !== undefined) {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      init.body = JSON.stringify(request.body);
    }

    const response = await this.fetchImpl(url, init);
    if (!response.ok) {
      throw new Error(`REST request failed with ${response.status}.`);
    }

    if (response.status === 204) {
      return undefined as TResult;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as TResult;
    }

    return (await response.text()) as TResult;
  }
}

export interface RestCrudAdapterConfig<TRemote, TId = string> {
  create?: {
    path: string | (() => string);
    select?: (result: unknown) => TRemote;
    serialize?: (input: TRemote) => unknown;
  };
  delete?: {
    path: (id: TId) => string;
  };
  getById?: {
    path: (id: TId) => string;
    select?: (result: unknown) => TRemote | null;
  };
  list?: {
    path: string | (() => string);
    query?: Record<string, boolean | number | string | null | undefined>;
    select?: (result: unknown) => TRemote[];
  };
  update?: {
    path: (id: TId) => string;
    select?: (result: unknown) => TRemote;
    serialize?: (input: TRemote) => unknown;
  };
}

export class RestCrudAdapter<TRemote, TId = string>
  implements CrudAdapter<TRemote, TId>
{
  public constructor(
    private readonly transport: RestTransport,
    private readonly config: RestCrudAdapterConfig<TRemote, TId>,
  ) {}

  public async create(input: TRemote): Promise<TRemote> {
    const config = this.config.create;
    if (!config) {
      throw new Error("This REST adapter does not implement create().");
    }

    const result = await this.transport.request({
      ...withBody(
        "POST",
        resolvePath(config.path),
        (config.serialize ?? identity)(input),
      ),
    });

    return (config.select ?? identity)(result as TRemote);
  }

  public async delete(id: TId): Promise<void> {
    const config = this.config.delete;
    if (!config) {
      throw new Error("This REST adapter does not implement delete().");
    }

    await this.transport.request({
      method: "DELETE",
      path: config.path(id),
    });
  }

  public async getById(id: TId): Promise<TRemote | null> {
    const config = this.config.getById;
    if (!config) {
      throw new Error("This REST adapter does not implement getById().");
    }

    const result = await this.transport.request({
      method: "GET",
      path: config.path(id),
    });

    return (config.select ?? identity)(result as TRemote | null);
  }

  public async list(): Promise<TRemote[]> {
    const config = this.config.list;
    if (!config) {
      throw new Error("This REST adapter does not implement list().");
    }

    const result = await this.transport.request({
      method: "GET",
      path: resolvePath(config.path),
      ...(config.query ? { query: config.query } : {}),
    });

    return (config.select ?? identity)(result as TRemote[]);
  }

  public async update(id: TId, input: TRemote): Promise<TRemote> {
    const config = this.config.update;
    if (!config) {
      throw new Error("This REST adapter does not implement update().");
    }

    const result = await this.transport.request({
      ...withBody(
        "PUT",
        config.path(id),
        (config.serialize ?? identity)(input),
      ),
    });

    return (config.select ?? identity)(result as TRemote);
  }
}

export function createFetchRestTransport(
  options: FetchRestTransportOptions,
): FetchRestTransport {
  return new FetchRestTransport(options);
}