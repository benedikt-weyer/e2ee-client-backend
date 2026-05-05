import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createBackendAdapterManifest,
  createEntitySchemaFromExpectedSchemaEntity,
  createEntitySchemasFromGeneratedSchemaFile,
  createGraphqlCrudAdaptersFromGeneratedSchemaFile,
  createGraphqlPasswordAuthConfigFromExpectedSchema,
  createGraphqlTransportFromGeneratedSchemaFile,
  createFetchRestTransport,
  createPasswordAuthAdapterFromConfig,
  createPasswordSessionAuthManifest,
  createRestCrudAdaptersFromGeneratedSchemaFile,
  createRestTransportFromGeneratedSchemaFile,
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
      database: {
        columns: [
          {
            columnName: "ciphertext",
            nullable: false,
            sqlType: "TEXT",
          },
          {
            columnName: "id",
            nullable: false,
            sqlType: "TEXT",
          },
          {
            columnName: "metadata",
            nullable: true,
            sqlType: "JSONB",
          },
          {
            columnName: "title",
            nullable: false,
            sqlType: "TEXT",
          },
        ],
        primaryKey: "id",
      },
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
      graphql: {
        allowCreate: true,
        allowDelete: true,
        allowGetById: true,
        allowList: true,
        allowUpdate: true,
        createMutation: "createNote",
        deleteMutation: "deleteNote",
        getByIdQuery: "note",
        listQuery: "notes",
        updateMutation: "updateNote",
      },
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

  it("accepts explicit database column metadata overrides", () => {
    const noteModel = defineEntityModel({
      fields: {
        id: field.string().remote("noteId"),
        title: field.string(),
      },
      idField: "id",
      name: "note",
    });

    const entity = defineBackendAdapterEntity({
      database: {
        columns: [
          {
            columnName: "note_id",
            nullable: false,
            sqlType: "UUID",
          },
          {
            columnName: "title",
            nullable: false,
            sqlType: "TEXT",
          },
        ],
        primaryKey: "note_id",
      },
      model: noteModel,
      tableName: "notes",
    });

    expect(entity.database).toEqual({
      columns: [
        {
          columnName: "note_id",
          nullable: false,
          sqlType: "UUID",
        },
        {
          columnName: "title",
          nullable: false,
          sqlType: "TEXT",
        },
      ],
      primaryKey: "note_id",
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
        columns: [
          {
            columnName: "id",
            nullable: false,
            sqlType: "TEXT",
          },
          {
            columnName: "title",
            nullable: false,
            sqlType: "TEXT",
          },
        ],
        primaryKey: "id",
        tableName: "notes",
      },
    ]);
    expect(manifest.database.expectedSchema.entities).toEqual([
      {
        api: {
          rest: {
            allowCreate: true,
            allowDelete: true,
            allowGetById: true,
            allowList: true,
            allowUpdate: true,
            basePath: "/entities/note",
          },
          type: "rest",
        },
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
    expect(manifest.database.expectedSchema.api).toEqual({
      rest: {
        baseUrl: "/api",
        defaultHeaders: {
          accept: "application/json",
        },
      },
      type: "rest",
    });
    expect(manifest.database.expectedSchema.authTables).toEqual([
      "users",
      "sessions",
    ]);
    expect(serializeBackendAdapterManifest(manifest)).toContain('"version": 4');
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

    expect(generated.cacheCollection).toBe("notes");
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

  it("reconstructs typed encrypted object fields from generated schema metadata", () => {
    const noteModel = defineEntityModel({
      fields: {
        config: field.json(z.unknown()).nullable().remote("configEnvelope").encrypted(),
        id: field.string(),
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

    manifest.database.expectedSchema.entities[0]!.fields[0]!.entitySchema = {
      schema: {
        additionalProperties: false,
        properties: {
          apiUrl: { schema: { type: "string" } },
          authHash: { nullable: true, schema: { type: "string" } },
          mode: { schema: { type: "enum", values: ["manual", "oauth"] } },
        },
        type: "object",
      },
    };

    const generated = createEntitySchemaFromExpectedSchemaEntity(
      manifest.database.expectedSchema.entities[0]!,
    );

    expect(generated.parseEntity?.({
      config: {
        apiUrl: "https://api.example.com",
        authHash: null,
        mode: "manual",
      },
      id: "note-1",
    })).toEqual({
      config: {
        apiUrl: "https://api.example.com",
        authHash: null,
        mode: "manual",
      },
      id: "note-1",
    });

    expect(() => generated.parseEntity?.({
      config: {
        apiUrl: "https://api.example.com",
        mode: "invalid",
      },
      id: "note-1",
    })).toThrow();
  });

  it("builds a graphql generated schema manifest when graphql metadata is requested", () => {
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
      database: {
        expectedSchema: {
          api: {
            graphql: {
              defaultHeaders: {
                accept: "application/json",
              },
              endpointPath: "/graphql",
            },
            type: "graphql",
          },
        },
      },
      entities: [defineBackendAdapterEntity({ model: noteModel })],
      name: "notes-service",
    });

    expect(manifest.database.expectedSchema.api).toEqual({
      graphql: {
        defaultHeaders: {
          accept: "application/json",
        },
        endpointPath: "/graphql",
      },
      type: "graphql",
    });
    expect(manifest.database.expectedSchema.entities[0]?.api).toEqual({
      graphql: {
        allowCreate: true,
        allowDelete: true,
        allowGetById: true,
        allowList: true,
        allowUpdate: true,
        createMutation: "createNote",
        deleteMutation: "deleteNote",
        getByIdQuery: "note",
        listQuery: "notes",
        updateMutation: "updateNote",
      },
      type: "graphql",
    });
    expect(serializeBackendAdapterManifest(manifest)).toContain('"version": 4');
  });

  it("builds client schemas from the generated schema file format", () => {
    const schemas = createEntitySchemasFromGeneratedSchemaFile(
      JSON.stringify({
        expectedSchema: {
          api: {
            rest: {
              baseUrl: "/api",
              defaultHeaders: {
                accept: "application/json",
              },
            },
            type: "rest",
          },
          authTables: ["users", "sessions"],
          entities: [
            {
              api: {
                rest: {
                  allowCreate: true,
                  allowDelete: true,
                  allowGetById: true,
                  allowList: true,
                  allowUpdate: true,
                  basePath: "/notes",
                },
                type: "rest",
              },
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
          entityTables: [{
            columns: [
              { columnName: "ciphertext", nullable: false, sqlType: "TEXT" },
              { columnName: "id", nullable: false, sqlType: "TEXT" },
            ],
            primaryKey: "id",
            tableName: "notes",
          }],
        },
      }),
      { note: { defaultStrategyId: "aes-256-gcm" } },
    );

    expect(Object.keys(schemas)).toEqual(["note"]);
    expect(schemas.note!.cacheCollection).toBe("notes");
    expect(schemas.note!.fields[0]).toEqual({
      encrypted: true,
      entityPath: "content",
      remotePath: "ciphertext",
      strategyId: "aes-256-gcm",
    });
  });

  it("builds REST CRUD adapters from the generated schema file format", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: URL, init?: RequestInit) => {
      const pathname = url.pathname;
      const method = init?.method ?? "GET";

      if (method === "GET" && pathname === "/api/notes") {
        return new Response(JSON.stringify([{ id: "note-1", title: "First" }]), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      if (method === "GET" && pathname === "/api/notes/note-1") {
        return new Response(JSON.stringify({ id: "note-1", title: "First" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      if (method === "POST" && pathname === "/api/notes") {
        return new Response(init?.body ?? JSON.stringify({}), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      if (method === "PUT" && pathname === "/api/notes/note-1") {
        return new Response(init?.body ?? JSON.stringify({}), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      if (method === "DELETE" && pathname === "/api/notes/note-1") {
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    const adapters = createRestCrudAdaptersFromGeneratedSchemaFile(
      JSON.stringify({
        expectedSchema: {
          api: {
            rest: {
              baseUrl: "/api",
              defaultHeaders: {
                accept: "application/json",
              },
            },
            type: "rest",
          },
          authTables: ["users", "sessions"],
          entities: [
            {
              api: {
                rest: {
                  allowCreate: true,
                  allowDelete: true,
                  allowGetById: true,
                  allowList: true,
                  allowUpdate: true,
                  basePath: "/notes",
                },
                type: "rest",
              },
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
          ],
          entityTables: [{
            columns: [
              { columnName: "id", nullable: false, sqlType: "TEXT" },
              { columnName: "title", nullable: false, sqlType: "TEXT" },
            ],
            primaryKey: "id",
            tableName: "notes",
          }],
        },
      }),
      createFetchRestTransport({
        baseUrl: "https://api.example.test/api",
        fetch: fetchMock,
      }),
    );

    const notes = adapters.note!;

    await expect(notes.list()).resolves.toEqual([{ id: "note-1", title: "First" }]);
    await expect(notes.getById("note-1")).resolves.toEqual({ id: "note-1", title: "First" });
    await expect(notes.create({ id: "note-1", title: "First" })).resolves.toEqual({ id: "note-1", title: "First" });
    await expect(notes.update("note-1", { id: "note-1", title: "Updated" })).resolves.toEqual({ id: "note-1", title: "Updated" });
    await expect(notes.delete("note-1")).resolves.toBeUndefined();
  });

  it("builds REST transport defaults from the generated schema file format", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    );

    const transport = createRestTransportFromGeneratedSchemaFile(
      JSON.stringify({
        expectedSchema: {
          api: {
            rest: {
              baseUrl: "https://api.example.test/api",
              defaultHeaders: {
                accept: "application/json",
              },
            },
            type: "rest",
          },
          authTables: ["users", "sessions"],
          entities: [
            {
              api: {
                rest: {
                  allowCreate: true,
                  allowDelete: true,
                  allowGetById: true,
                  allowList: true,
                  allowUpdate: true,
                  basePath: "/notes",
                },
                type: "rest",
              },
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
              ],
              idPath: "id",
              name: "note",
              primaryKey: "id",
              tableName: "notes",
            },
          ],
          entityTables: [{
            columns: [
              { columnName: "id", nullable: false, sqlType: "TEXT" },
            ],
            primaryKey: "id",
            tableName: "notes",
          }],
        },
      }),
      { fetch: fetchMock },
    );

    await expect(
      transport.request<{ ok: boolean }>({
        method: "GET",
        path: "/notes",
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("notes", "https://api.example.test/api/"),
      {
        headers: new Headers({ accept: "application/json" }),
        method: "GET",
      },
    );
  });

  it("builds GraphQL CRUD adapters, auth, and transport defaults from the generated schema file format", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        query: string;
        variables?: Record<string, unknown>;
      };

      if (payload.query.includes("query GetKdfSalt")) {
        return new Response(JSON.stringify({ data: { kdfSalt: "salt-123" } }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      if (payload.query.includes("mutation Login")) {
        return new Response(JSON.stringify({
          data: {
            login: {
              message: null,
              ok: true,
              user: {
                email: "a@example.test",
                id: "user-1",
              },
            },
          },
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      if (payload.query.includes("query ListNotes")) {
        return new Response(JSON.stringify({
          data: {
            notes: [{ id: "note-1", title: "First" }],
          },
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      if (payload.query.includes("query GetNoteById")) {
        return new Response(JSON.stringify({
          data: {
            note: { id: "note-1", title: "First" },
          },
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      if (payload.query.includes("mutation CreateNote")) {
        return new Response(JSON.stringify({
          data: {
            createNote: payload.variables?.input,
          },
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      if (payload.query.includes("mutation UpdateNote")) {
        return new Response(JSON.stringify({
          data: {
            updateNote: payload.variables?.input,
          },
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      if (payload.query.includes("mutation DeleteNote")) {
        return new Response(JSON.stringify({
          data: {
            deleteNote: true,
          },
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      throw new Error(`Unexpected GraphQL request to ${url}: ${payload.query}`);
    });

    const schemaJson = JSON.stringify({
      expectedSchema: {
        api: {
          graphql: {
            defaultHeaders: {
              accept: "application/json",
            },
            endpointPath: "/graphql",
          },
          type: "graphql",
        },
        authTables: ["users", "sessions"],
        entities: [
          {
            api: {
              graphql: {
                allowCreate: true,
                allowDelete: true,
                allowGetById: true,
                allowList: true,
                allowUpdate: true,
                createMutation: "createNote",
                deleteMutation: "deleteNote",
                getByIdQuery: "note",
                listQuery: "notes",
                updateMutation: "updateNote",
              },
              type: "graphql",
            },
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
        ],
        entityTables: [{
          columns: [
            { columnName: "id", nullable: false, sqlType: "TEXT" },
            { columnName: "title", nullable: false, sqlType: "TEXT" },
          ],
          primaryKey: "id",
          tableName: "notes",
        }],
      },
    });

    const transport = createGraphqlTransportFromGeneratedSchemaFile(schemaJson, {
      baseUrl: "https://api.example.test",
      fetch: fetchMock,
    });
    const adapters = createGraphqlCrudAdaptersFromGeneratedSchemaFile(schemaJson, transport);
    const auth = createGraphqlPasswordAuthConfigFromExpectedSchema(
      JSON.parse(schemaJson).expectedSchema,
      transport,
    );
    const authAdapter = createPasswordAuthAdapterFromConfig(auth);

    await expect(authAdapter.getKdfSalt("a@example.test")).resolves.toBe("salt-123");
    await expect(authAdapter.login("a@example.test", "hex")).resolves.toEqual({
      message: null,
      ok: true,
      user: {
        email: "a@example.test",
        id: "user-1",
      },
    });

    const notes = adapters.note!;
    await expect(notes.list()).resolves.toEqual([{ id: "note-1", title: "First" }]);
    await expect(notes.getById("note-1")).resolves.toEqual({ id: "note-1", title: "First" });
    await expect(notes.create({ id: "note-2", title: "Created" })).resolves.toEqual({
      id: "note-2",
      title: "Created",
    });
    await expect(notes.update("note-1", { id: "note-1", title: "Updated" })).resolves.toEqual({
      id: "note-1",
      title: "Updated",
    });
    await expect(notes.delete("note-1")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/graphql",
      expect.objectContaining({
        headers: expect.any(Headers),
        method: "POST",
      }),
    );
  });
});
