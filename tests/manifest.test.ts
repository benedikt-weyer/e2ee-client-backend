import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createBackendAdapterManifest,
  createPasswordSessionAuthManifest,
  defineBackendAdapterEntity,
  resolveBackendAdapterAuthUrls,
  resolveBackendAdapterEntityUrl,
  resolveBackendAdapterRealtimeUrl,
  serializeBackendAdapterManifest,
} from "../src";
import { field, defineEntityModel } from "../src/schema-builder";

describe("backend adapter manifest", () => {
  it("derives entity field metadata from schema definitions", () => {
    const noteModel = defineEntityModel({
      defaultStrategyId: "aes-256-gcm",
      fields: {
        content: field.string().remote("ciphertext").encrypted(),
        id: field.string(),
        metadata: field
          .json(
            z.object({
              tags: z.array(z.string()),
            }),
          )
          .nullable()
          .optional(),
        title: field.string(),
      },
      idField: "id",
      name: "note",
    });

    const entity = defineBackendAdapterEntity({
      model: noteModel,
      tableName: "notes",
    });

    expect(entity).toEqual({
      fields: [
        {
          encrypted: true,
          entityPath: "content",
          entityType: "string",
          nullable: false,
          optional: false,
          remotePath: "ciphertext",
          remoteType: "string",
          strategyId: "aes-256-gcm",
        },
        {
          encrypted: false,
          entityPath: "id",
          entityType: "string",
          nullable: false,
          optional: false,
          remotePath: "id",
          remoteType: "string",
        },
        {
          encrypted: false,
          entityPath: "metadata",
          entityType: "object",
          nullable: true,
          optional: true,
          remotePath: "metadata",
          remoteType: "object",
        },
        {
          encrypted: false,
          entityPath: "title",
          entityType: "string",
          nullable: false,
          optional: false,
          remotePath: "title",
          remoteType: "string",
        },
      ],
      idPath: "id",
      name: "note",
      rest: {
        allowCreate: true,
        allowDelete: true,
        allowGetById: true,
        allowList: true,
        allowUpdate: true,
        basePath: "/entities/note",
      },
      tableName: "notes",
    });
  });

  it("builds a versioned manifest and resolves adapter URLs", () => {
    const noteModel = defineEntityModel({
      fields: {
        id: field.string(),
        title: field.string(),
      },
      idField: "id",
      name: "note",
    });

    const manifest = createBackendAdapterManifest({
      auth: createPasswordSessionAuthManifest({
        paths: {
          getKdfSalt: "/auth/kdf-salt",
          login: "/auth/login",
          logout: "/auth/logout",
          refresh: "/auth/refresh",
          registerBegin: "/auth/register/begin",
          registerComplete: "/auth/register/complete",
        },
        refreshDurationSeconds: 60 * 60 * 24 * 30,
        sessionDurationSeconds: 60 * 60,
      }),
      entities: [defineBackendAdapterEntity({ model: noteModel })],
      name: "notes-service",
      realtime: {
        entities: [{ entityName: "note", topic: "notes" }],
        path: "/ws/realtime",
        protocol: "websocket",
      },
    });

    expect(manifest.database.expectedSchema.entityTables).toEqual([
      {
        primaryKey: "id",
        tableName: "notes",
      },
    ]);
    expect(manifest.database.expectedSchema.authTables).toEqual([
      "users",
      "sessions",
    ]);
    expect(serializeBackendAdapterManifest(manifest)).toContain('"version": 1');
    expect(
      resolveBackendAdapterAuthUrls({
        manifest,
        serverUrl: "https://api.example.test/",
      }),
    ).toEqual({
      getKdfSalt: "https://api.example.test/auth/kdf-salt",
      login: "https://api.example.test/auth/login",
      logout: "https://api.example.test/auth/logout",
      refresh: "https://api.example.test/auth/refresh",
      registerBegin: "https://api.example.test/auth/register/begin",
      registerComplete: "https://api.example.test/auth/register/complete",
    });
    expect(
      resolveBackendAdapterEntityUrl(
        {
          manifest,
          serverUrl: "https://api.example.test/",
        },
        "note",
      ),
    ).toBe("https://api.example.test/entities/note");
    expect(
      resolveBackendAdapterRealtimeUrl({
        manifest,
        realtimeUrl: "wss://api.example.test",
        serverUrl: "https://api.example.test",
      }),
    ).toBe("wss://api.example.test/ws/realtime");
  });
});
