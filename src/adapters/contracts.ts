export interface CrudAdapter<TRemote, TId = string> {
  create(input: TRemote): Promise<TRemote>;
  delete(id: TId): Promise<void>;
  getById(id: TId): Promise<TRemote | null>;
  list(): Promise<TRemote[]>;
  update(id: TId, input: TRemote): Promise<TRemote>;
}

export interface GraphqlTransport {
  mutate<TResult, TVariables = Record<string, unknown>>(
    document: unknown,
    variables?: TVariables,
  ): Promise<TResult>;
  query<TResult, TVariables = Record<string, unknown>>(
    document: unknown,
    variables?: TVariables,
  ): Promise<TResult>;
}

export type RestMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export interface RestRequest<TBody = unknown> {
  body?: TBody;
  headers?: Record<string, string>;
  method: RestMethod;
  path: string;
  query?: Record<string, boolean | number | string | null | undefined>;
}

export interface RestTransport {
  request<TResult, TBody = unknown>(request: RestRequest<TBody>): Promise<TResult>;
}