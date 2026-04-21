import { describe, expect, it } from "vitest";
import type {
  CrudAdapter,
  RealtimeSource,
  RemoteRealtimeEvent,
} from "../src/adapters/contracts";
import { createLokiCacheStore } from "../src/cache/loki-cache";
import { createAes256GcmStrategy } from "../src/crypto/aes-gcm-strategy";
import { createStrategyRegistry } from "../src/crypto/strategy-registry";
import { E2eeEncryptionStrategy } from "../src/crypto/types";
import { createEntityRepository, type StrategyContextResolver } from "../src/repositories/entity-repository";
import {
  createIntegrationSchema,
  type IntegrationEntity,
  type IntegrationRemoteRecord,
} from "../src/schemas/integration";

class ManualRealtimeSource<TRemote, TId = string>
  implements RealtimeSource<TRemote, TId>
{
  private sink:
    | {
    onComplete?(): void;
    onData(event: RemoteRealtimeEvent<TRemote, TId>): void;
    onError(error: unknown): void;
  }
    | undefined;

  public emit(event: RemoteRealtimeEvent<TRemote, TId>): void {
    this.sink?.onData(event);
  }

  public subscribe(sink: {
    onComplete?(): void;
    onData(event: RemoteRealtimeEvent<TRemote, TId>): void;
    onError(error: unknown): void;
  }) {
    this.sink = sink;
    return {
      unsubscribe: () => {
        this.sink = undefined;
      },
    };
  }
}

class InMemoryCrudAdapter<TRemote extends { id: string }>
  implements CrudAdapter<TRemote, string>
{
  public readonly items = new Map<string, TRemote>();

  public async create(input: TRemote): Promise<TRemote> {
    this.items.set(input.id, structuredClone(input));
    return structuredClone(input);
  }

  public async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  public async getById(id: string): Promise<TRemote | null> {
    const entry = this.items.get(id);
    return entry ? structuredClone(entry) : null;
  }

  public async list(): Promise<TRemote[]> {
    return [...this.items.values()].map((value) => structuredClone(value));
  }

  public async update(id: string, input: TRemote): Promise<TRemote> {
    this.items.set(id, structuredClone(input));
    return structuredClone(input);
  }
}

describe("entity repository", () => {
  it("encrypts only selected integration fields and caches plaintext entities", async () => {
    const key = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 11));
    const adapter = new InMemoryCrudAdapter<IntegrationRemoteRecord>();
    const resolver: StrategyContextResolver<IntegrationEntity, IntegrationRemoteRecord> = {
      async resolve() {
        return { key };
      },
    };
    const repository = createEntityRepository({
      adapter,
      cache: createLokiCacheStore<IntegrationEntity, string>(),
      contextResolver: resolver,
      schema: createIntegrationSchema(E2eeEncryptionStrategy.Aes256Gcm),
      strategies: createStrategyRegistry(createAes256GcmStrategy()),
    });

    const entity: IntegrationEntity = {
      apiUrl: "https://api.example.test",
      authHash: "auth-hash",
      credentialMode: "PROVIDER_SECRET",
      displayName: "External Tasks",
      encryptionKey: "legacy-encryption-key",
      id: "integration-1",
      lastSyncedAt: null,
      provider: "ExternalTasks",
      providerSecret: "provider-secret",
      status: "Connected",
      username: "alice@example.com",
    };

    const saved = await repository.create(entity);
    const remote = adapter.items.get(entity.id);

    expect(saved).toEqual(entity);
    expect(remote?.apiUrl).toBe(entity.apiUrl);
    expect(remote?.username).toBe(entity.username);
    expect(remote?.authHash).toMatchObject({ algorithm: E2eeEncryptionStrategy.Aes256Gcm, version: 1 });
    expect(remote?.providerSecret).toMatchObject({ algorithm: E2eeEncryptionStrategy.Aes256Gcm, version: 1 });
    expect(remote?.encryptionKey).toMatchObject({ algorithm: E2eeEncryptionStrategy.Aes256Gcm, version: 1 });

    adapter.items.clear();

    const cached = await repository.getById(entity.id, { cacheMode: "cache-first" });
    expect(cached).toEqual(entity);
  });

  it("applies pushed remote updates through the normal decrypt and cache pipeline", async () => {
    const key = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 21));
    const adapter = new InMemoryCrudAdapter<IntegrationRemoteRecord>();
    const resolver: StrategyContextResolver<IntegrationEntity, IntegrationRemoteRecord> = {
      async resolve() {
        return { key };
      },
    };

    const sourceRepository = createEntityRepository({
      adapter,
      contextResolver: resolver,
      schema: createIntegrationSchema(E2eeEncryptionStrategy.Aes256Gcm),
      strategies: createStrategyRegistry(createAes256GcmStrategy()),
    });

    const pushedEntity: IntegrationEntity = {
      apiUrl: "https://api.example.test",
      authHash: "incoming-auth-hash",
      credentialMode: "PROVIDER_SECRET",
      displayName: "Realtime Integration",
      encryptionKey: "incoming-encryption-key",
      id: "integration-realtime",
      lastSyncedAt: null,
      provider: "ExternalTasks",
      providerSecret: "incoming-provider-secret",
      status: "Connected",
      username: "realtime@example.com",
    };

    await sourceRepository.create(pushedEntity);
    const remote = adapter.items.get(pushedEntity.id);
    expect(remote).toBeTruthy();

    const cache = createLokiCacheStore<IntegrationEntity, string>();
    const repository = createEntityRepository({
      adapter,
      cache,
      contextResolver: resolver,
      schema: createIntegrationSchema(E2eeEncryptionStrategy.Aes256Gcm),
      strategies: createStrategyRegistry(createAes256GcmStrategy()),
    });

    const events: Array<{ id: string; type: string }> = [];
    repository.subscribe((event) => {
      if (event.type === "create" || event.type === "update" || event.type === "delete") {
        events.push({ id: event.id, type: event.type });
      }
    });

    const applied = await repository.applyRemoteUpdate(remote as IntegrationRemoteRecord, {
      type: "update",
    });

    expect(applied).toEqual(pushedEntity);
    expect(cache.get("integrations", pushedEntity.id)).toEqual(pushedEntity);
    expect(events).toEqual([{ id: pushedEntity.id, type: "update" }]);
  });

  it("supports per-model realtime sources and evicts cache entries on pushed deletes", async () => {
    const key = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 31));
    const adapter = new InMemoryCrudAdapter<IntegrationRemoteRecord>();
    const resolver: StrategyContextResolver<IntegrationEntity, IntegrationRemoteRecord> = {
      async resolve() {
        return { key };
      },
    };
    const source = new ManualRealtimeSource<IntegrationRemoteRecord, string>();
    const cache = createLokiCacheStore<IntegrationEntity, string>();
    const repository = createEntityRepository({
      adapter,
      cache,
      contextResolver: resolver,
      realtime: {
        autoStart: true,
        source,
      },
      schema: createIntegrationSchema(E2eeEncryptionStrategy.Aes256Gcm),
      strategies: createStrategyRegistry(createAes256GcmStrategy()),
    });

    const seedingRepository = createEntityRepository({
      adapter,
      contextResolver: resolver,
      schema: createIntegrationSchema(E2eeEncryptionStrategy.Aes256Gcm),
      strategies: createStrategyRegistry(createAes256GcmStrategy()),
    });

    const entity: IntegrationEntity = {
      apiUrl: "https://api.example.test",
      authHash: "auth-hash",
      credentialMode: "PROVIDER_SECRET",
      displayName: "Disconnectable",
      encryptionKey: "legacy-encryption-key",
      id: "integration-2",
      lastSyncedAt: null,
      provider: "ExternalTasks",
      providerSecret: "provider-secret",
      status: "Connected",
      username: "alice@example.com",
    };

    await seedingRepository.create(entity);
    const remote = adapter.items.get(entity.id) as IntegrationRemoteRecord;

    const events: string[] = [];
    repository.subscribe((event) => {
      events.push(event.type);
    });

    const createdSeen = new Promise<void>((resolve) => {
      const unsubscribe = repository.subscribe((event) => {
        if (event.type === "create") {
          unsubscribe();
          resolve();
        }
      });
    });

    source.emit({
      record: remote,
      type: "create",
    });
    await createdSeen;

    expect(await repository.getById(entity.id, { cacheMode: "cache-first" })).toEqual(entity);

    source.emit({
      id: entity.id,
      type: "delete",
    });

    expect(cache.get("integrations", entity.id)).toBeNull();
    expect(events).toEqual(["create", "delete"]);
    expect(repository.realtime?.isConnected()).toBe(true);
    repository.realtime?.disconnect();
    expect(repository.realtime?.isConnected()).toBe(false);
  });
});