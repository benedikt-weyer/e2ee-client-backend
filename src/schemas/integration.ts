import type { EncryptedFieldValue } from "../crypto/types";
import type { EntitySchema } from "../repositories/entity-repository";
import { defineEntityModel, field } from "../schema-builder";

type IntegrationRemoteFieldValue = EncryptedFieldValue | string | null;

export interface IntegrationEntity {
  apiUrl: string;
  authHash: string | null;
  credentialMode: string;
  displayName: string;
  encryptionKey: string | null;
  id: string;
  lastSyncedAt: string | null;
  provider: string;
  providerSecret: string | null;
  status: string;
  username: string;
}

export interface IntegrationRemoteRecord {
  apiUrl: string;
  authHash: IntegrationRemoteFieldValue;
  credentialMode: string;
  displayName: string;
  encryptionKey: IntegrationRemoteFieldValue;
  id: string;
  lastSyncedAt: string | null;
  provider: string;
  providerSecret: IntegrationRemoteFieldValue;
  status: string;
  username: string;
}

export function createIntegrationSchema(
  strategyId = "aes-256-gcm",
): EntitySchema<IntegrationEntity, IntegrationRemoteRecord, string> {
  return defineEntityModel({
    cacheCollection: "integrations",
    defaultStrategyId: strategyId,
    fields: {
      apiUrl: field.string(),
      authHash: field.string().nullable().encrypted(),
      credentialMode: field.string(),
      displayName: field.string(),
      encryptionKey: field.string().nullable().encrypted(),
      id: field.string(),
      lastSyncedAt: field.string().nullable(),
      provider: field.string(),
      providerSecret: field.string().nullable().encrypted(),
      status: field.string(),
      username: field.string(),
    },
    idField: "id",
    name: "integration",
  });
}