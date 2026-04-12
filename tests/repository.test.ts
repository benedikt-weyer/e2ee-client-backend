import { describe, expect, it } from "vitest";
import type { CrudAdapter } from "../src/adapters/contracts";
import { createLokiCacheStore } from "../src/cache/loki-cache";
import { createAes256GcmStrategy } from "../src/crypto/aes-gcm-strategy";
import { createStrategyRegistry } from "../src/crypto/strategy-registry";
import { createEntityRepository, type StrategyContextResolver } from "../src/repositories/entity-repository";
import {
  createIntegrationSchema,
  type IntegrationEntity,
  type IntegrationRemoteRecord,
} from "../src/schemas/integration";

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
      schema: createIntegrationSchema(),
      strategies: createStrategyRegistry(createAes256GcmStrategy()),
    });

    const entity: IntegrationEntity = {
      apiUrl: "https://api.example.test",
      authHash: "auth-hash",
      credentialMode: "PROVIDER_SECRET",
      displayName: "Plandera",
      encryptionKey: "legacy-encryption-key",
      id: "integration-1",
      lastSyncedAt: null,
      provider: "Plandera",
      providerSecret: "provider-secret",
      status: "Connected",
      username: "alice@example.com",
    };

    const saved = await repository.create(entity);
    const remote = adapter.items.get(entity.id);

    expect(saved).toEqual(entity);
    expect(remote?.apiUrl).toBe(entity.apiUrl);
    expect(remote?.username).toBe(entity.username);
    expect(remote?.authHash).toMatchObject({ algorithm: "aes-256-gcm", version: 1 });
    expect(remote?.providerSecret).toMatchObject({ algorithm: "aes-256-gcm", version: 1 });
    expect(remote?.encryptionKey).toMatchObject({ algorithm: "aes-256-gcm", version: 1 });

    adapter.items.clear();

    const cached = await repository.getById(entity.id, { cacheMode: "cache-first" });
    expect(cached).toEqual(entity);
  });
});