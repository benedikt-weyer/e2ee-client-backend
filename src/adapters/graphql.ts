import type {
  CrudAdapter,
  GraphqlTransport,
  SubscriptionHandle,
  SubscriptionSink,
  SubscriptionTransport,
} from "./contracts";

export type GraphqlOperationKind = "mutation" | "query";

export interface GraphqlSubscriptionExecutorInput<
  TResult = unknown,
  TVariables = Record<string, unknown>,
> {
  document: unknown;
  kind: "subscription";
  sink: SubscriptionSink<TResult>;
  variables?: TVariables;
}

export type GraphqlSubscriptionExecutor = <
  TResult,
  TVariables = Record<string, unknown>,
>(
  input: GraphqlSubscriptionExecutorInput<TResult, TVariables>,
) => SubscriptionHandle;

export interface GraphqlExecutorInput<TVariables = Record<string, unknown>> {
  document: unknown;
  kind: GraphqlOperationKind;
  variables?: TVariables;
}

export type GraphqlExecutor = <
  TResult,
  TVariables = Record<string, unknown>,
>(
  input: GraphqlExecutorInput<TVariables>,
) => Promise<TResult>;

export class FunctionGraphqlTransport implements GraphqlTransport {
  public constructor(private readonly executor: GraphqlExecutor) {}

  public mutate<TResult, TVariables = Record<string, unknown>>(
    document: unknown,
    variables?: TVariables,
  ): Promise<TResult> {
    return this.executor<TResult, TVariables>(
      variables === undefined
        ? {
            document,
            kind: "mutation",
          }
        : {
            document,
            kind: "mutation",
            variables,
          },
    );
  }

  public query<TResult, TVariables = Record<string, unknown>>(
    document: unknown,
    variables?: TVariables,
  ): Promise<TResult> {
    return this.executor<TResult, TVariables>(
      variables === undefined
        ? {
            document,
            kind: "query",
          }
        : {
            document,
            kind: "query",
            variables,
          },
    );
  }
}

export class FunctionGraphqlSubscriptionTransport
  implements SubscriptionTransport
{
  public constructor(
    private readonly executor: GraphqlSubscriptionExecutor,
  ) {}

  public subscribe<TResult, TVariables = Record<string, unknown>>(
    document: unknown,
    sink: SubscriptionSink<TResult>,
    variables?: TVariables,
  ): SubscriptionHandle {
    return this.executor<TResult, TVariables>(
      variables === undefined
        ? {
            document,
            kind: "subscription",
            sink,
          }
        : {
            document,
            kind: "subscription",
            sink,
            variables,
          },
    );
  }
}

type VariablesFactory<TResult> =
  | Record<string, unknown>
  | ((result?: TResult) => Record<string, unknown> | undefined);

function resolveVariables<TResult>(
  variables?: VariablesFactory<TResult>,
  result?: TResult,
): Record<string, unknown> | undefined {
  if (!variables) {
    return undefined;
  }

  return typeof variables === "function" ? variables(result) : variables;
}

export interface GraphqlCrudAdapterConfig<TRemote, TId = string> {
  create?: {
    buildVariables: (input: TRemote) => Record<string, unknown>;
    document: unknown;
    select: (result: unknown) => TRemote;
  };
  delete?: {
    buildVariables: (id: TId) => Record<string, unknown>;
    document: unknown;
  };
  getById?: {
    buildVariables: (id: TId) => Record<string, unknown>;
    document: unknown;
    select: (result: unknown) => TRemote | null;
  };
  list?: {
    document: unknown;
    select: (result: unknown) => TRemote[];
    variables?: VariablesFactory<TRemote[]>;
  };
  update?: {
    buildVariables: (id: TId, input: TRemote) => Record<string, unknown>;
    document: unknown;
    select: (result: unknown) => TRemote;
  };
}

export class GraphqlCrudAdapter<TRemote, TId = string>
  implements CrudAdapter<TRemote, TId>
{
  public constructor(
    private readonly transport: GraphqlTransport,
    private readonly config: GraphqlCrudAdapterConfig<TRemote, TId>,
  ) {}

  public async create(input: TRemote): Promise<TRemote> {
    const config = this.config.create;
    if (!config) {
      throw new Error("This GraphQL adapter does not implement create().");
    }

    const result = await this.transport.mutate(
      config.document,
      config.buildVariables(input),
    );

    return config.select(result);
  }

  public async delete(id: TId): Promise<void> {
    const config = this.config.delete;
    if (!config) {
      throw new Error("This GraphQL adapter does not implement delete().");
    }

    await this.transport.mutate(config.document, config.buildVariables(id));
  }

  public async getById(id: TId): Promise<TRemote | null> {
    const config = this.config.getById;
    if (!config) {
      throw new Error("This GraphQL adapter does not implement getById().");
    }

    const result = await this.transport.query(
      config.document,
      config.buildVariables(id),
    );

    return config.select(result);
  }

  public async list(): Promise<TRemote[]> {
    const config = this.config.list;
    if (!config) {
      throw new Error("This GraphQL adapter does not implement list().");
    }

    const result = await this.transport.query(
      config.document,
      resolveVariables(config.variables),
    );

    return config.select(result);
  }

  public async update(id: TId, input: TRemote): Promise<TRemote> {
    const config = this.config.update;
    if (!config) {
      throw new Error("This GraphQL adapter does not implement update().");
    }

    const result = await this.transport.mutate(
      config.document,
      config.buildVariables(id, input),
    );

    return config.select(result);
  }
}

export function createGraphqlTransport(
  executor: GraphqlExecutor,
): FunctionGraphqlTransport {
  return new FunctionGraphqlTransport(executor);
}

export function createGraphqlSubscriptionTransport(
  executor: GraphqlSubscriptionExecutor,
): FunctionGraphqlSubscriptionTransport {
  return new FunctionGraphqlSubscriptionTransport(executor);
}