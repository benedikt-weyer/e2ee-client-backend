import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { CrudAdapter, RealtimeSource } from "../src/adapters/contracts";
import {
  createEntityClient,
  defineClientModel,
} from "../src/client-factory";
import { createAes256GcmStrategy } from "../src/crypto/aes-gcm-strategy";
import { createStrategyRegistry } from "../src/crypto/strategy-registry";
import {
  E2eeEncryptionStrategy,
  type EncryptedFieldValue,
} from "../src/crypto/types";
import type { StrategyContextResolver } from "../src/repositories/entity-repository";
import { defineEntityModel, field } from "../src/schema-builder";

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

class ManualRealtimeSource<TRemote extends { id: string }>
  implements RealtimeSource<TRemote, string>
{
  public subscribeCalls = 0;

  public subscribe(sink: {
    onComplete?(): void;
    onData(event: { id?: string; record?: TRemote; type: "create" | "delete" | "update" }): void;
    onError(error: unknown): void;
  }) {
    this.subscribeCalls += 1;
    return {
      unsubscribe: () => {
        sink.onComplete?.();
      },
    };
  }
}

const key = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 17));

function createResolver<TEntity, TRemote>(): StrategyContextResolver<TEntity, TRemote> {
  return {
    async resolve() {
      return { key };
    },
  };
}

describe("entity client factory", () => {
  it("returns repositories by default for model definitions", async () => {
    const dashboardModel = defineEntityModel({
      defaultStrategyId: E2eeEncryptionStrategy.Aes256Gcm,
      fields: {
        config: field
          .json(
            z.object({
              layout: z.enum(["grid", "list"]),
            }),
          )
          .nullable()
          .remote("configEnvelope")
          .encrypted(),
        id: field.string(),
        name: field.string(),
      },
      idField: "id",
      name: "dashboard",
    });

    const adapter = new InMemoryCrudAdapter<{
      configEnvelope: EncryptedFieldValue | { layout: "grid" | "list" } | null;
      id: string;
      name: string;
    }>();

    const client = createEntityClient({
      contextResolver: createResolver(),
      models: {
        dashboards: defineClientModel({
          adapter,
          schema: dashboardModel,
        }),
      },
      strategies: createStrategyRegistry(createAes256GcmStrategy()),
    });

    await client.dashboards.create({
      config: { layout: "grid" },
      id: "dashboard-1",
      name: "Ops",
    });

    adapter.items.clear();

    await expect(
      client.dashboards.getById("dashboard-1", { cacheMode: "cache-first" }),
    ).resolves.toEqual({
      config: { layout: "grid" },
      id: "dashboard-1",
      name: "Ops",
    });
  });

  it("supports custom services built from model definitions", async () => {
    const dashboardModel = defineEntityModel({
      defaultStrategyId: E2eeEncryptionStrategy.Aes256Gcm,
      fields: {
        config: field
          .json(
            z.object({
              layout: z.enum(["grid", "list"]),
            }),
          )
          .nullable()
          .remote("configEnvelope")
          .encrypted(),
        id: field.string(),
        name: field.string(),
      },
      idField: "id",
      name: "dashboard",
    });

    const adapter = new InMemoryCrudAdapter<{
      configEnvelope: EncryptedFieldValue | { layout: "grid" | "list" } | null;
      id: string;
      name: string;
    }>();

    const client = createEntityClient({
      contextResolver: createResolver(),
      models: {
        dashboards: defineClientModel({
          adapter,
          schema: dashboardModel,
          setup({ repository }) {
            return {
              async createNamed(name: string) {
                return repository.create({
                  config: null,
                  id: name.toLowerCase(),
                  name,
                });
              },
              repository,
            };
          },
        }),
      },
      strategies: createStrategyRegistry(createAes256GcmStrategy()),
    });

    const created = await client.dashboards.createNamed("Primary");

    expect(created).toEqual({
      config: null,
      id: "primary",
      name: "Primary",
    });
    await expect(
      client.dashboards.repository.getById("primary", { cacheMode: "cache-first" }),
    ).resolves.toEqual(created);
  });

  it("wires optional realtime controllers through repositories and setup contexts", () => {
    const dashboardModel = defineEntityModel({
      fields: {
        id: field.string(),
        name: field.string(),
      },
      idField: "id",
      name: "dashboard",
    });
    const adapter = new InMemoryCrudAdapter<{
      id: string;
      name: string;
    }>();
    const source = new ManualRealtimeSource<{ id: string; name: string }>();

    const client = createEntityClient({
      contextResolver: createResolver(),
      models: {
        dashboards: defineClientModel({
          adapter,
          realtime: {
            autoStart: true,
            source,
          },
          schema: dashboardModel,
          setup({ realtime, repository }) {
            return {
              realtime,
              repository,
            };
          },
        }),
      },
      strategies: createStrategyRegistry(createAes256GcmStrategy()),
    });

    expect(source.subscribeCalls).toBe(1);
    expect(client.dashboards.realtime?.isConnected()).toBe(true);
    client.dashboards.realtime?.disconnect();
    expect(client.dashboards.realtime?.isConnected()).toBe(false);
    expect(client.dashboards.repository.realtime?.isConnected()).toBe(false);
  });
});