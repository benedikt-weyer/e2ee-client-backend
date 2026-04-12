import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { CrudAdapter } from "../src/adapters/contracts";
import { createLokiCacheStore } from "../src/cache/loki-cache";
import { createAes256GcmStrategy } from "../src/crypto/aes-gcm-strategy";
import { createStrategyRegistry } from "../src/crypto/strategy-registry";
import {
  createEntityRepository,
  type StrategyContextResolver,
} from "../src/repositories/entity-repository";
import {
  createDashboardSchema,
  type DashboardEntity,
  type DashboardRemoteRecord,
} from "../src/schemas/dashboard";
import {
  defineEntityModel,
  field,
  type InferEntity,
  type InferRemote,
} from "../src/schema-builder";

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

const key = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 31));

function createResolver<TEntity, TRemote>(): StrategyContextResolver<TEntity, TRemote> {
  return {
    async resolve() {
      return { key };
    },
  };
}

describe("schema builder", () => {
  it("supports Prisma-like model definitions with encrypted fields", async () => {
    const dashboardModel = defineEntityModel({
      cacheCollection: "dashboards",
      defaultStrategyId: "aes-256-gcm",
      fields: {
        config: field
          .json(
            z.object({
              layout: z.enum(["grid", "list"]),
              showFilters: z.boolean(),
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
    type DashboardModelEntity = InferEntity<typeof dashboardModel>;
    type DashboardModelRemote = InferRemote<typeof dashboardModel>;

    const adapter = new InMemoryCrudAdapter<DashboardModelRemote>();
    const repository = createEntityRepository({
      adapter,
      cache: createLokiCacheStore<DashboardModelEntity, string>(),
      contextResolver: createResolver<DashboardModelEntity, DashboardModelRemote>(),
      schema: dashboardModel,
      strategies: createStrategyRegistry(createAes256GcmStrategy()),
    });

    const entity: DashboardModelEntity = {
      config: {
        layout: "grid",
        showFilters: true,
      },
      id: "dashboard-1",
      name: "Ops",
    };

    const saved = await repository.create(entity);
    const remote = adapter.items.get(entity.id);

    expect(saved).toEqual(entity);
    expect(remote?.configEnvelope).toMatchObject({
      algorithm: "aes-256-gcm",
      version: 1,
    });
    expect(remote?.name).toBe(entity.name);
  });

  it("rejects invalid entity data before encryption", async () => {
    const dashboardModel = defineEntityModel({
      defaultStrategyId: "aes-256-gcm",
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
    type DashboardModelEntity = InferEntity<typeof dashboardModel>;
    type DashboardModelRemote = InferRemote<typeof dashboardModel>;

    const repository = createEntityRepository({
      adapter: new InMemoryCrudAdapter<DashboardModelRemote>(),
      cache: createLokiCacheStore<DashboardModelEntity, string>(),
      contextResolver: createResolver<DashboardModelEntity, DashboardModelRemote>(),
      schema: dashboardModel,
      strategies: createStrategyRegistry(createAes256GcmStrategy()),
    });

    await expect(
      repository.create({
        config: {
          layout: "wrong",
        },
        id: "dashboard-1",
        name: "Ops",
      } as unknown as DashboardModelEntity),
    ).rejects.toThrow();
  });

  it("rejects invalid remote payloads during hydration", async () => {
    const schema = createDashboardSchema<{ layout: "grid" | "list" }>({
      configSchema: z.object({
        layout: z.enum(["grid", "list"]),
      }),
    });
    const adapter = new InMemoryCrudAdapter<DashboardRemoteRecord<{ layout: "grid" | "list" }>>();
    const repository = createEntityRepository({
      adapter,
      cache: createLokiCacheStore<DashboardEntity<{ layout: "grid" | "list" }>, string>(),
      contextResolver: createResolver<
        DashboardEntity<{ layout: "grid" | "list" }>,
        DashboardRemoteRecord<{ layout: "grid" | "list" }>
      >(),
      schema,
      strategies: createStrategyRegistry(createAes256GcmStrategy()),
    });

    adapter.items.set("dashboard-1", {
      configEnvelope: null,
      createdAt: "2026-04-12T00:00:00.000Z",
      id: "dashboard-1",
      name: 123 as never,
      updatedAt: "2026-04-12T00:00:00.000Z",
    });

    await expect(repository.getById("dashboard-1")).rejects.toThrow();
  });
});