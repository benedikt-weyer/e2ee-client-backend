import {
  createLokiCacheStore,
  type CacheStore,
} from "./cache/loki-cache";
import { StrategyRegistry } from "./crypto/strategy-registry";
import {
  createEntityRepository,
  type EntityRepository,
  type EntitySchema,
  type StrategyContextResolver,
} from "./repositories/entity-repository";
import type { CrudAdapter } from "./adapters/contracts";

export type AnyEntitySchema = EntitySchema<any, any, any>;

export type EntityOfSchema<TSchema extends AnyEntitySchema> =
  TSchema extends EntitySchema<infer TEntity, any, any> ? TEntity : never;

export type RemoteOfSchema<TSchema extends AnyEntitySchema> =
  TSchema extends EntitySchema<any, infer TRemote, any> ? TRemote : never;

export type IdOfSchema<TSchema extends AnyEntitySchema> =
  TSchema extends EntitySchema<any, any, infer TId> ? TId : never;

export type RepositoryOfSchema<TSchema extends AnyEntitySchema> = EntityRepository<
  EntityOfSchema<TSchema>,
  RemoteOfSchema<TSchema>,
  IdOfSchema<TSchema>
>;

export interface ClientModelSetupContext<TSchema extends AnyEntitySchema> {
  adapter: CrudAdapter<RemoteOfSchema<TSchema>, IdOfSchema<TSchema>>;
  cache?: CacheStore<EntityOfSchema<TSchema>, IdOfSchema<TSchema>>;
  contextResolver: StrategyContextResolver<EntityOfSchema<TSchema>, RemoteOfSchema<TSchema>>;
  modelKey: string;
  repository: RepositoryOfSchema<TSchema>;
  schema: TSchema;
  strategies: StrategyRegistry;
}

export interface ClientModelDefinition<
  TSchema extends AnyEntitySchema,
  TService = RepositoryOfSchema<TSchema>,
> {
  adapter: CrudAdapter<RemoteOfSchema<TSchema>, IdOfSchema<TSchema>>;
  cache?: CacheStore<EntityOfSchema<TSchema>, IdOfSchema<TSchema>> | null;
  contextResolver?: StrategyContextResolver<EntityOfSchema<TSchema>, RemoteOfSchema<TSchema>>;
  schema: TSchema;
  setup?(context: ClientModelSetupContext<TSchema>): TService;
}

export type ClientModelsMap = Record<string, ClientModelDefinition<AnyEntitySchema, any>>;

export type ClientOutput<TModels extends ClientModelsMap> = {
  [TKey in keyof TModels]: TModels[TKey] extends ClientModelDefinition<any, infer TService>
    ? TService
    : never;
};

export interface CreateEntityClientOptions<TModels extends ClientModelsMap> {
  cacheFactory?: <TSchema extends AnyEntitySchema>(args: {
    modelKey: string;
    schema: TSchema;
  }) => CacheStore<EntityOfSchema<TSchema>, IdOfSchema<TSchema>> | null;
  contextResolver?: StrategyContextResolver<any, any>;
  models: TModels;
  strategies: StrategyRegistry;
}

export function defineClientModel<
  TSchema extends AnyEntitySchema,
  TService = RepositoryOfSchema<TSchema>,
>(
  definition: ClientModelDefinition<TSchema, TService>,
): ClientModelDefinition<TSchema, TService> {
  return definition;
}

function resolveCache<TSchema extends AnyEntitySchema>(args: {
  cacheFactory?: CreateEntityClientOptions<any>["cacheFactory"];
  definition: ClientModelDefinition<TSchema, any>;
  modelKey: string;
}): CacheStore<EntityOfSchema<TSchema>, IdOfSchema<TSchema>> | undefined {
  if (args.definition.cache !== undefined) {
    return args.definition.cache ?? undefined;
  }

  if (args.cacheFactory) {
    return (
      args.cacheFactory({
        modelKey: args.modelKey,
        schema: args.definition.schema,
      }) ?? undefined
    );
  }

  return createLokiCacheStore<EntityOfSchema<TSchema>, IdOfSchema<TSchema>>();
}

export function createClientModelOutput<TSchema extends AnyEntitySchema, TService>(args: {
  definition: ClientModelDefinition<TSchema, TService>;
  modelKey: string;
  options: CreateEntityClientOptions<any>;
}): TService {
  const cache = resolveCache({
    cacheFactory: args.options.cacheFactory,
    definition: args.definition,
    modelKey: args.modelKey,
  });

  const contextResolver = args.definition.contextResolver ?? args.options.contextResolver;
  if (!contextResolver) {
    throw new Error(
      `Model "${args.modelKey}" requires a context resolver. Provide one globally or per model.`,
    );
  }

  const repositoryOptions = {
    adapter: args.definition.adapter,
    contextResolver,
    schema: args.definition.schema,
    strategies: args.options.strategies,
  } as {
    adapter: CrudAdapter<RemoteOfSchema<TSchema>, IdOfSchema<TSchema>>;
    cache?: CacheStore<EntityOfSchema<TSchema>, IdOfSchema<TSchema>>;
    contextResolver: StrategyContextResolver<EntityOfSchema<TSchema>, RemoteOfSchema<TSchema>>;
    schema: TSchema;
    strategies: StrategyRegistry;
  };

  if (cache) {
    repositoryOptions.cache = cache;
  }

  const repository = createEntityRepository(repositoryOptions) as RepositoryOfSchema<TSchema>;

  if (!args.definition.setup) {
    return repository as TService;
  }

  const setupContext = {
    adapter: args.definition.adapter,
    contextResolver,
    modelKey: args.modelKey,
    repository,
    schema: args.definition.schema,
    strategies: args.options.strategies,
  } as ClientModelSetupContext<TSchema>;

  if (cache) {
    setupContext.cache = cache;
  }

  return args.definition.setup(setupContext);
}

export function createEntityClient<TModels extends ClientModelsMap>(
  options: CreateEntityClientOptions<TModels>,
): ClientOutput<TModels> {
  const output = {} as ClientOutput<TModels>;

  for (const [modelKey, definition] of Object.entries(options.models)) {
    output[modelKey as keyof TModels] = createClientModelOutput({
      definition,
      modelKey,
      options,
    }) as ClientOutput<TModels>[keyof TModels];
  }

  return output;
}