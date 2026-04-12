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

type AnySchema = EntitySchema<any, any, any>;

type EntityOf<TSchema extends AnySchema> =
  TSchema extends EntitySchema<infer TEntity, any, any> ? TEntity : never;

type RemoteOf<TSchema extends AnySchema> =
  TSchema extends EntitySchema<any, infer TRemote, any> ? TRemote : never;

type IdOf<TSchema extends AnySchema> =
  TSchema extends EntitySchema<any, any, infer TId> ? TId : never;

type RepositoryOf<TSchema extends AnySchema> = EntityRepository<
  EntityOf<TSchema>,
  RemoteOf<TSchema>,
  IdOf<TSchema>
>;

export interface ClientModelSetupContext<TSchema extends AnySchema> {
  adapter: CrudAdapter<RemoteOf<TSchema>, IdOf<TSchema>>;
  cache?: CacheStore<EntityOf<TSchema>, IdOf<TSchema>>;
  contextResolver: StrategyContextResolver<EntityOf<TSchema>, RemoteOf<TSchema>>;
  modelKey: string;
  repository: RepositoryOf<TSchema>;
  schema: TSchema;
  strategies: StrategyRegistry;
}

export interface ClientModelDefinition<
  TSchema extends AnySchema,
  TService = RepositoryOf<TSchema>,
> {
  adapter: CrudAdapter<RemoteOf<TSchema>, IdOf<TSchema>>;
  cache?: CacheStore<EntityOf<TSchema>, IdOf<TSchema>> | null;
  contextResolver?: StrategyContextResolver<EntityOf<TSchema>, RemoteOf<TSchema>>;
  schema: TSchema;
  setup?(context: ClientModelSetupContext<TSchema>): TService;
}

type ClientModelsMap = Record<string, ClientModelDefinition<AnySchema, any>>;

type ClientOutput<TModels extends ClientModelsMap> = {
  [TKey in keyof TModels]: TModels[TKey] extends ClientModelDefinition<any, infer TService>
    ? TService
    : never;
};

export interface CreateEntityClientOptions<TModels extends ClientModelsMap> {
  cacheFactory?: <TSchema extends AnySchema>(args: {
    modelKey: string;
    schema: TSchema;
  }) => CacheStore<EntityOf<TSchema>, IdOf<TSchema>> | null;
  contextResolver?: StrategyContextResolver<any, any>;
  models: TModels;
  strategies: StrategyRegistry;
}

export function defineClientModel<
  TSchema extends AnySchema,
  TService = RepositoryOf<TSchema>,
>(
  definition: ClientModelDefinition<TSchema, TService>,
): ClientModelDefinition<TSchema, TService> {
  return definition;
}

function resolveCache<TSchema extends AnySchema>(args: {
  cacheFactory?: CreateEntityClientOptions<any>["cacheFactory"];
  definition: ClientModelDefinition<TSchema, any>;
  modelKey: string;
}): CacheStore<EntityOf<TSchema>, IdOf<TSchema>> | undefined {
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

  return createLokiCacheStore<EntityOf<TSchema>, IdOf<TSchema>>();
}

function createModelOutput<TSchema extends AnySchema, TService>(args: {
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
    adapter: CrudAdapter<RemoteOf<TSchema>, IdOf<TSchema>>;
    cache?: CacheStore<EntityOf<TSchema>, IdOf<TSchema>>;
    contextResolver: StrategyContextResolver<EntityOf<TSchema>, RemoteOf<TSchema>>;
    schema: TSchema;
    strategies: StrategyRegistry;
  };

  if (cache) {
    repositoryOptions.cache = cache;
  }

  const repository = createEntityRepository(repositoryOptions) as RepositoryOf<TSchema>;

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
    output[modelKey as keyof TModels] = createModelOutput({
      definition,
      modelKey,
      options,
    }) as ClientOutput<TModels>[keyof TModels];
  }

  return output;
}