import type { EncryptedFieldValue } from "../crypto/types";
import type { EntitySchema } from "../repositories/entity-repository";

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
  return {
    cacheCollection: "integrations",
    createEntity(remote) {
      return {
        apiUrl: remote.apiUrl,
        authHash: (remote.authHash as string | null) ?? null,
        credentialMode: remote.credentialMode,
        displayName: remote.displayName,
        encryptionKey: (remote.encryptionKey as string | null) ?? null,
        id: remote.id,
        lastSyncedAt: remote.lastSyncedAt,
        provider: remote.provider,
        providerSecret: (remote.providerSecret as string | null) ?? null,
        status: remote.status,
        username: remote.username,
      };
    },
    createRemote(entity) {
      return {
        apiUrl: entity.apiUrl,
        authHash: entity.authHash,
        credentialMode: entity.credentialMode,
        displayName: entity.displayName,
        encryptionKey: entity.encryptionKey,
        id: entity.id,
        lastSyncedAt: entity.lastSyncedAt,
        provider: entity.provider,
        providerSecret: entity.providerSecret,
        status: entity.status,
        username: entity.username,
      };
    },
    defaultStrategyId: strategyId,
    fields: [
      {
        encrypted: true,
        entityPath: "authHash",
      },
      {
        encrypted: true,
        entityPath: "providerSecret",
      },
      {
        encrypted: true,
        entityPath: "encryptionKey",
      },
    ],
    name: "integration",
  };
}