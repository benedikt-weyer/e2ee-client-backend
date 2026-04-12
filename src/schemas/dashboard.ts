import type { EncryptedFieldValue } from "../crypto/types";
import type { EntitySchema } from "../repositories/entity-repository";
import { defineEntityModel, field } from "../schema-builder";
import { z } from "zod";

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

export interface DashboardSchemaOptions<TConfig = Record<string, unknown>> {
  configSchema?: z.ZodType<TConfig>;
  strategyId?: string;
}

export function createDashboardSchema<TConfig = Record<string, unknown>>(
  options: DashboardSchemaOptions<TConfig> | string = "aes-256-gcm",
): EntitySchema<DashboardEntity<TConfig>, DashboardRemoteRecord<TConfig>, string> {
  const resolvedOptions =
    typeof options === "string" ? { strategyId: options } : options;
  const configSchema =
    resolvedOptions.configSchema ?? z.custom<TConfig>(() => true);

  return defineEntityModel({
    cacheCollection: "dashboards",
    defaultStrategyId: resolvedOptions.strategyId ?? "aes-256-gcm",
    fields: {
      config: field
        .json(configSchema)
        .nullable()
        .remote("configEnvelope")
        .encrypted(),
      createdAt: field.string(),
      id: field.string(),
      name: field.string(),
      updatedAt: field.string(),
    },
    idField: "id",
    name: "dashboard",
  });
}