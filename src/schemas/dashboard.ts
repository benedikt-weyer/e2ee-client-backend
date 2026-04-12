import type { EncryptedFieldValue } from "../crypto/types";
import type { EntitySchema } from "../repositories/entity-repository";

export interface DashboardEntity<TConfig = Record<string, unknown>> {
  config: TConfig | null;
  createdAt: string;
  id: string;
  name: string;
  updatedAt: string;
}

export interface DashboardRemoteRecord<TConfig = Record<string, unknown>> {
  configEnvelope: EncryptedFieldValue | TConfig | null;
  createdAt: string;
  id: string;
  name: string;
  updatedAt: string;
}

export function createDashboardSchema<TConfig = Record<string, unknown>>(
  strategyId = "aes-256-gcm",
): EntitySchema<DashboardEntity<TConfig>, DashboardRemoteRecord<TConfig>, string> {
  return {
    cacheCollection: "dashboards",
    createEntity(remote) {
      return {
        config: (remote.configEnvelope as TConfig | null) ?? null,
        createdAt: remote.createdAt,
        id: remote.id,
        name: remote.name,
        updatedAt: remote.updatedAt,
      };
    },
    createRemote(entity) {
      return {
        configEnvelope: entity.config,
        createdAt: entity.createdAt,
        id: entity.id,
        name: entity.name,
        updatedAt: entity.updatedAt,
      };
    },
    defaultStrategyId: strategyId,
    fields: [
      {
        encrypted: true,
        entityPath: "config",
        remotePath: "configEnvelope",
      },
    ],
    name: "dashboard",
  };
}