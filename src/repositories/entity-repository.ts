import type {
  CrudAdapter,
  RealtimeSource,
  SubscriptionHandle,
} from "../adapters/contracts";
import type { CacheStore } from "../cache/loki-cache";
import { StrategyRegistry } from "../crypto/strategy-registry";
import {
  type EncryptionAlgorithmId,
  type EncryptedFieldValue,
  isEncryptedFieldValue,
} from "../crypto/types";
import { bytesToUtf8, utf8ToBytes } from "../encoding/base64";

type JsonObject = Record<string, unknown>;

function cloneValue<TValue>(value: TValue): TValue {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== "object") {
    return value;
  }

  return structuredClone(value);
}

function getByPath(target: JsonObject, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as JsonObject)[segment];
  }, target);
}

function setByPath(target: JsonObject, path: string, value: unknown): void {
  const segments = path.split(".");
  const lastSegment = segments.at(-1);
  if (!lastSegment) {
    return;
  }

  let current: JsonObject = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[segment] = {};
    }
    current = current[segment] as JsonObject;
  }

  current[lastSegment] = value;
}

function deleteByPath(target: JsonObject, path: string): void {
  const segments = path.split(".");
  const lastSegment = segments.at(-1);
  if (!lastSegment) {
    return;
  }

  let current: JsonObject = target;
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return;
    }
    current = next as JsonObject;
  }

  delete current[lastSegment];
}

function stringifyValue(value: unknown): Uint8Array {
  return utf8ToBytes(JSON.stringify(value));
}

function parseValue(bytes: Uint8Array): unknown {
  return JSON.parse(bytesToUtf8(bytes));
}

export interface FieldPolicy<TEntity, TRemote> {
  deserialize?: (value: unknown, remote: TRemote) => unknown;
  encrypted?: boolean;
  entityPath: string;
  remotePath?: string;
  serialize?: (value: unknown, entity: TEntity) => unknown;
  strategyId?: EncryptionAlgorithmId;
}

export interface EntitySchema<TEntity, TRemote, TId = string> {
  cacheCollection?: string;
  createEntity(remote: TRemote): TEntity;
  createRemote(entity: TEntity): TRemote;
  defaultStrategyId?: EncryptionAlgorithmId;
  fields: FieldPolicy<TEntity, TRemote>[];
  idPath?: string;
  name: string;
  parseEntity?: (entity: unknown) => TEntity;
  parseRemote?: (remote: unknown) => TRemote;
}

export interface StrategyContextResolver<TEntity, TRemote> {
  resolve(args: {
    entity?: TEntity;
    field: FieldPolicy<TEntity, TRemote>;
    payload?: EncryptedFieldValue;
    phase: "decrypt" | "encrypt";
    remote?: TRemote;
    schema: EntitySchema<TEntity, TRemote, any>;
  }): Promise<unknown>;
}

export interface RepositoryReadOptions {
  cacheMode?: "cache-first" | "network-first" | "no-cache";
}

export interface EntityRepositoryRealtimeConfig<TRemote, TId = string> {
  autoStart?: boolean;
  source: RealtimeSource<TRemote, TId>;
}

export type EntityRepositoryChangeEvent<TEntity, TId = string> =
  | {
      entity: TEntity;
      id: TId;
      origin: "local" | "realtime";
      type: "create" | "update";
    }
  | {
      id: TId;
      origin: "local" | "realtime";
      type: "delete";
    }
  | {
      error: unknown;
      origin: "realtime";
      type: "error";
    };

export interface EntityRepositoryRealtimeController {
  connect(): () => void;
  disconnect(): void;
  isConnected(): boolean;
}

export interface EntityRepositoryOptions<TEntity, TRemote, TId = string> {
  adapter: CrudAdapter<TRemote, TId>;
  cache?: CacheStore<TEntity, TId>;
  contextResolver: StrategyContextResolver<TEntity, TRemote>;
  realtime?: EntityRepositoryRealtimeConfig<TRemote, TId>;
  schema: EntitySchema<TEntity, TRemote, TId>;
  strategies: StrategyRegistry;
}

export class EntityRepository<TEntity, TRemote, TId = string> {
  private readonly cacheCollection: string;
  private readonly changeListeners = new Set<
    (event: EntityRepositoryChangeEvent<TEntity, TId>) => void
  >();
  private readonly idPath: string;
  private realtimeSubscription: SubscriptionHandle | null = null;

  public readonly realtime?: EntityRepositoryRealtimeController;

  public constructor(private readonly options: EntityRepositoryOptions<TEntity, TRemote, TId>) {
    this.cacheCollection = options.schema.cacheCollection ?? options.schema.name;
    this.idPath = options.schema.idPath ?? "id";

    if (options.realtime) {
      this.realtime = {
        connect: () => {
          this.connectRealtime();
          return () => {
            this.disconnectRealtime();
          };
        },
        disconnect: () => {
          this.disconnectRealtime();
        },
        isConnected: () => this.realtimeSubscription !== null,
      };

      if (options.realtime.autoStart) {
        this.connectRealtime();
      }
    }
  }

  public async create(entity: TEntity): Promise<TEntity> {
    const validatedEntity = this.parseEntity(entity);
    const remote = await this.serializeEntity(validatedEntity);
    const created = await this.options.adapter.create(remote);
    return this.applyRemoteUpdate(created, {
      origin: "local",
      type: "create",
    });
  }

  public async delete(id: TId): Promise<void> {
    await this.options.adapter.delete(id);
    this.applyRemoteDelete(id, {
      origin: "local",
    });
  }

  public async applyRemoteUpdate(
    remote: TRemote,
    args: {
      origin?: "local" | "realtime";
      type?: "create" | "update";
    } = {},
  ): Promise<TEntity> {
    const entity = await this.hydrateRemote(remote, true);
    this.emitChange({
      entity,
      id: this.resolveEntityId(entity),
      origin: args.origin ?? "realtime",
      type: args.type ?? "update",
    });
    return entity;
  }

  public applyRemoteDelete(
    id: TId,
    args: {
      origin?: "local" | "realtime";
    } = {},
  ): void {
    this.options.cache?.remove(this.cacheCollection, id);
    this.emitChange({
      id,
      origin: args.origin ?? "realtime",
      type: "delete",
    });
  }

  public async getById(
    id: TId,
    options: RepositoryReadOptions = {},
  ): Promise<TEntity | null> {
    const cacheMode = options.cacheMode ?? "network-first";
    if (cacheMode === "cache-first") {
      const cached = this.options.cache?.get(this.cacheCollection, id) ?? null;
      if (cached) {
        return cached;
      }
    }

    if (cacheMode === "no-cache") {
      const remote = await this.options.adapter.getById(id);
      return remote ? this.hydrateRemote(remote, false) : null;
    }

    const remote = await this.options.adapter.getById(id);
    return remote ? this.hydrateRemote(remote, true) : null;
  }

  public async list(options: RepositoryReadOptions = {}): Promise<TEntity[]> {
    const cacheMode = options.cacheMode ?? "network-first";
    if (cacheMode === "cache-first") {
      const cached = this.options.cache?.list(this.cacheCollection) ?? [];
      if (cached.length > 0) {
        return cached;
      }
    }

    const remoteItems = await this.options.adapter.list();
    const items = await Promise.all(
      remoteItems.map((remote) => this.hydrateRemote(remote, cacheMode !== "no-cache")),
    );

    if (cacheMode !== "no-cache" && this.options.cache) {
      this.options.cache.clearCollection(this.cacheCollection);
      for (const entity of items) {
        this.options.cache.put(
          this.cacheCollection,
          this.resolveEntityId(entity),
          entity,
        );
      }
    }

    return items;
  }

  public async update(id: TId, entity: TEntity): Promise<TEntity> {
    const validatedEntity = this.parseEntity(entity);
    const remote = await this.serializeEntity(validatedEntity);
    const updated = await this.options.adapter.update(id, remote);
    return this.applyRemoteUpdate(updated, {
      origin: "local",
      type: "update",
    });
  }

  public subscribe(
    listener: (event: EntityRepositoryChangeEvent<TEntity, TId>) => void,
  ): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private async hydrateRemote(remote: TRemote, storeInCache: boolean): Promise<TEntity> {
    const parsedRemote = this.parseRemote(remote);
    const workingRemote = cloneValue(parsedRemote) as JsonObject;

    for (const field of this.options.schema.fields) {
      await this.hydrateField(parsedRemote, workingRemote, field);
    }

    const entity = this.parseEntity(
      this.options.schema.createEntity(workingRemote as TRemote),
    );
    if (storeInCache && this.options.cache) {
      this.options.cache.put(
        this.cacheCollection,
        this.resolveEntityId(entity),
        entity,
      );
    }

    return entity;
  }

  private connectRealtime(): void {
    if (this.realtimeSubscription || !this.options.realtime) {
      return;
    }

    this.realtimeSubscription = this.options.realtime.source.subscribe({
      onComplete: () => {
        this.realtimeSubscription = null;
      },
      onData: (event) => {
        void this.handleRealtimeEvent(event).catch((error) => {
          this.emitChange({
            error,
            origin: "realtime",
            type: "error",
          });
        });
      },
      onError: (error) => {
        this.emitChange({
          error,
          origin: "realtime",
          type: "error",
        });
      },
    });
  }

  private disconnectRealtime(): void {
    this.realtimeSubscription?.unsubscribe();
    this.realtimeSubscription = null;
  }

  private emitChange(event: EntityRepositoryChangeEvent<TEntity, TId>): void {
    for (const listener of this.changeListeners) {
      listener(event);
    }
  }

  private async handleRealtimeEvent(event: {
    id?: TId;
    record?: TRemote;
    type: "create" | "delete" | "update";
  }): Promise<void> {
    if (event.type === "delete") {
      this.applyRemoteDelete(event.id as TId, {
        origin: "realtime",
      });
      return;
    }

    await this.applyRemoteUpdate(event.record as TRemote, {
      origin: "realtime",
      type: event.type,
    });
  }

  private resolveEntityId(entity: TEntity): TId {
    return getByPath(entity as JsonObject, this.idPath) as TId;
  }

  private async hydrateField(
    remote: TRemote,
    workingRemote: JsonObject,
    field: FieldPolicy<TEntity, TRemote>,
  ): Promise<void> {
    const remotePath = field.remotePath ?? field.entityPath;
    const currentValue = getByPath(workingRemote, remotePath);

    if (field.encrypted) {
      if (currentValue === null || currentValue === undefined) {
        return;
      }

      if (!isEncryptedFieldValue(currentValue)) {
        throw new Error(
          `Field "${remotePath}" on entity "${this.options.schema.name}" is not an encrypted payload.`,
        );
      }

      const context = await this.options.contextResolver.resolve({
        field,
        payload: currentValue,
        phase: "decrypt",
        remote,
        schema: this.options.schema,
      });
      const plaintext = await this.options.strategies.decrypt(currentValue, context);
      const parsed = parseValue(plaintext);
      const nextValue = field.deserialize ? field.deserialize(parsed, remote) : parsed;
      setByPath(workingRemote, remotePath, nextValue);
      return;
    }

    if (field.deserialize) {
      setByPath(workingRemote, remotePath, field.deserialize(currentValue, remote));
    }
  }

  private async serializeEntity(entity: TEntity): Promise<TRemote> {
    const remote = cloneValue(this.options.schema.createRemote(entity)) as JsonObject;

    for (const field of this.options.schema.fields) {
      const entityValue = getByPath(entity as JsonObject, field.entityPath);
      const remotePath = field.remotePath ?? field.entityPath;
      const serializedValue = field.serialize
        ? field.serialize(entityValue, entity)
        : cloneValue(entityValue);

      if (serializedValue === undefined) {
        deleteByPath(remote, remotePath);
        continue;
      }

      if (field.encrypted) {
        const strategyId = field.strategyId ?? this.options.schema.defaultStrategyId;
        if (!strategyId) {
          throw new Error(
            `Field "${field.entityPath}" requires an encryption strategy, but none was configured.`,
          );
        }

        const context = await this.options.contextResolver.resolve({
          entity,
          field,
          phase: "encrypt",
          remote: remote as TRemote,
          schema: this.options.schema,
        });
        const payload = await this.options.strategies.encrypt(
          strategyId,
          stringifyValue(serializedValue),
          context,
        );
        setByPath(remote, remotePath, payload);
        continue;
      }

      setByPath(remote, remotePath, serializedValue);
    }

    return this.parseRemote(remote as TRemote);
  }

  private parseEntity(entity: unknown): TEntity {
    return this.options.schema.parseEntity
      ? this.options.schema.parseEntity(entity)
      : (entity as TEntity);
  }

  private parseRemote(remote: unknown): TRemote {
    return this.options.schema.parseRemote
      ? this.options.schema.parseRemote(remote)
      : (remote as TRemote);
  }
}

export function createEntityRepository<TEntity, TRemote, TId = string>(
  options: EntityRepositoryOptions<TEntity, TRemote, TId>,
): EntityRepository<TEntity, TRemote, TId> {
  return new EntityRepository(options);
}