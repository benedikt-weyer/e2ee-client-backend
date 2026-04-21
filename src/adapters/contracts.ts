export interface CrudAdapter<TRemote, TId = string> {
  create(input: TRemote): Promise<TRemote>;
  delete(id: TId): Promise<void>;
  getById(id: TId): Promise<TRemote | null>;
  list(): Promise<TRemote[]>;
  update(id: TId, input: TRemote): Promise<TRemote>;
}

export interface SubscriptionSink<TValue> {
  onComplete?(): void;
  onData(value: TValue): void;
  onError(error: unknown): void;
}

export interface SubscriptionHandle {
  unsubscribe(): void;
}

export interface SubscriptionTransport {
  subscribe<TResult, TVariables = Record<string, unknown>>(
    document: unknown,
    sink: SubscriptionSink<TResult>,
    variables?: TVariables,
  ): SubscriptionHandle;
}

export type RemoteRealtimeEvent<TRemote, TId = string> =
  | {
      record: TRemote;
      type: "create" | "update";
    }
  | {
      id: TId;
      type: "delete";
    };

export interface RealtimeSource<TRemote, TId = string> {
  subscribe(
    sink: SubscriptionSink<RemoteRealtimeEvent<TRemote, TId>>,
  ): SubscriptionHandle;
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