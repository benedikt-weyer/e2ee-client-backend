import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createBackendAdapterManifest,
  createEntitySchemaFromExpectedSchemaEntity,
  createEntitySchemasFromGeneratedSchemaFile,
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
    expect(manifest.database.expectedSchema.entities).toEqual([
      {
        fields: [
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
        primaryKey: "id",
        tableName: "notes",
      },
    ]);
    expect(manifest.database.expectedSchema.authTables).toEqual([
      "users",
      "sessions",
    ]);
    expect(serializeBackendAdapterManifest(manifest)).toContain('"version": 2');
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

  it("reconstructs a client entity schema from generated expected schema", () => {
    const noteModel = defineEntityModel({
      defaultStrategyId: "aes-256-gcm",
      fields: {
        content: field.string().remote("ciphertext").encrypted(),
        id: field.string(),
        metadata: field.json(z.object({ tags: z.array(z.string()) })).nullable(),
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
      entities: [defineBackendAdapterEntity({ model: noteModel, tableName: "notes" })],
      name: "notes-service",
    });

    const generated = createEntitySchemaFromExpectedSchemaEntity(
      manifest.database.expectedSchema.entities[0]!,
      { defaultStrategyId: "aes-256-gcm" },
    );

    expect(generated.name).toBe("note");
    expect(generated.idPath).toBe("id");
    expect(generated.fields).toEqual([
      {
        encrypted: true,
        entityPath: "content",
        remotePath: "ciphertext",
        strategyId: "aes-256-gcm",
      },
      {
        encrypted: false,
        entityPath: "id",
      },
      {
        encrypted: false,
        entityPath: "metadata",
      },
    ]);
    expect(generated.parseEntity?.({
      content: "hello",
      id: "note-1",
      metadata: { tags: ["one"] },
    })).toEqual({
      content: "hello",
      id: "note-1",
      metadata: { tags: ["one"] },
    });
    expect(generated.parseRemote?.({
      ciphertext: {
        algorithm: "aes-256-gcm",
        ciphertextBase64: "abc",
        nonceBase64: "def",
        version: 1,
      },
      id: "note-1",
      metadata: null,
    })).toEqual({
      ciphertext: {
        algorithm: "aes-256-gcm",
        ciphertextBase64: "abc",
        nonceBase64: "def",
        version: 1,
      },
      id: "note-1",
      metadata: null,
    });
    expect(generated.createEntity({
      ciphertext: "hello",
      id: "note-1",
      metadata: null,
    })).toEqual({
      content: "hello",
      id: "note-1",
      metadata: null,
    });
    expect(generated.createRemote({
      content: "hello",
      id: "note-1",
      metadata: null,
    })).toEqual({
      ciphertext: "hello",
      id: "note-1",
      metadata: null,
    });
  });

  it("builds client schemas from the generated schema file format", () => {
    const schemas = createEntitySchemasFromGeneratedSchemaFile(
      JSON.stringify({
        expectedSchema: {
          authTables: ["users", "sessions"],
          entities: [
            {
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
              ],
              idPath: "id",
              name: "note",
              primaryKey: "id",
              tableName: "notes",
            },
          ],
          entityTables: [{ primaryKey: "id", tableName: "notes" }],
        },
      }),
      { note: { defaultStrategyId: "aes-256-gcm" } },
    );

    expect(Object.keys(schemas)).toEqual(["note"]);
    expect(schemas.note!.fields[0]).toEqual({
      encrypted: true,
      entityPath: "content",
      remotePath: "ciphertext",
      strategyId: "aes-256-gcm",
    });
  });
});
