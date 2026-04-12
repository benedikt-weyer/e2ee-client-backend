import { describe, expect, it } from "vitest";
import type { CrudAdapter, GraphqlTransport, RestTransport } from "../src/adapters/contracts";
import {
  createGraphqlPasswordAuthConfig,
  createRestPasswordAuthConfig,
} from "../src/auth/password-auth-client";
import {
  E2eeBackendStorageStrategy,
  createE2eeBackend,
} from "../src/e2ee-backend";
import {
  E2eeEncryptionStrategy,
  type EncryptedFieldValue,
} from "../src/crypto/types";
import { bytesToBase64 } from "../src/encoding/base64";
import { defineEntityModel, field } from "../src/schema-builder";
import { defineClientModel } from "../src/client-factory";

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

class SharedStore {
  private value: {
    encryptionKeyBase64: string | null;
    normalizedEmail: string | null;
    password: string | null;
  } | null = null;

  public load() {
    return this.value ? structuredClone(this.value) : null;
  }

  public save(value: {
    encryptionKeyBase64: string | null;
    normalizedEmail: string | null;
    password: string | null;
  } | null) {
    this.value = value ? structuredClone(value) : null;
  }
}

const saltBase64 = bytesToBase64(Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1)));

function createGraphqlAuth(): ReturnType<typeof createGraphqlPasswordAuthConfig<{ email: string }>> {
  const transport: GraphqlTransport = {
    async mutate<TResult, TVariables = Record<string, unknown>>(document: unknown, variables?: TVariables) {
      if (document === "LOGIN") {
        return {
          login: { ok: true, user: { email: String((variables as { email: string }).email) } },
        } as TResult;
      }
      if (document === "LOGOUT") {
        return { logout: true } as TResult;
      }
      if (document === "REFRESH") {
        return { refreshSession: { ok: true, user: { email: "ops@example.com" } } } as TResult;
      }
      if (document === "REGISTER_BEGIN") {
        return { registerBegin: { kdfSaltBase64: saltBase64 } } as TResult;
      }
      if (document === "REGISTER_COMPLETE") {
        return {
          registerComplete: {
            ok: true,
            user: { email: String((variables as { email: string }).email) },
          },
        } as TResult;
      }

      throw new Error(`Unexpected mutation ${String(document)}.`);
    },
    async query<TResult, TVariables = Record<string, unknown>>(document: unknown, _variables?: TVariables) {
      if (document === "KDF_SALT") {
        return { kdfSalt: saltBase64 } as TResult;
      }

      throw new Error(`Unexpected query ${String(document)}.`);
    },
  };

  return createGraphqlPasswordAuthConfig<{ email: string }>({
    documents: {
      getKdfSalt: "KDF_SALT",
      login: "LOGIN",
      logout: "LOGOUT",
      refresh: "REFRESH",
      registerBegin: "REGISTER_BEGIN",
      registerComplete: "REGISTER_COMPLETE",
    },
    transport,
  });
}

function createRestAuth(): ReturnType<typeof createRestPasswordAuthConfig<{ email: string }>> {
  const transport: RestTransport = {
    async request<TResult, TBody = unknown>(request: { body?: TBody; method: string; path: string }) {
      if (request.method === "GET" && request.path === "/auth/kdf-salt") {
        return { kdfSaltBase64: saltBase64 } as TResult;
      }
      if (request.method === "POST" && request.path === "/auth/login") {
        const body = request.body as { email: string };
        return { ok: true, user: { email: body.email } } as TResult;
      }
      if (request.method === "POST" && request.path === "/auth/logout") {
        return true as TResult;
      }
      if (request.method === "POST" && request.path === "/auth/refresh") {
        return { ok: true, user: { email: "ops@example.com" } } as TResult;
      }
      if (request.method === "POST" && request.path === "/auth/register-begin") {
        return { kdfSaltBase64: saltBase64 } as TResult;
      }
      if (request.method === "POST" && request.path === "/auth/register-complete") {
        const body = request.body as { email: string };
        return { ok: true, user: { email: body.email } } as TResult;
      }

      throw new Error(`Unexpected request ${request.method} ${request.path}.`);
    },
  };

  return createRestPasswordAuthConfig<{ email: string }>({ transport });
}

describe("E2eeBackend", () => {
  it("manages password auth, persisted key state, and lazy model clients", async () => {
    const store = new SharedStore();
    const adapter = new InMemoryCrudAdapter<{
      id: string;
      name: string;
      secretEnvelope: EncryptedFieldValue | string;
    }>();

    const noteModel = defineEntityModel({
      fields: {
        id: field.string(),
        name: field.string(),
        secret: field.string().remote("secretEnvelope").encrypted(),
      },
      idField: "id",
      name: "note",
    });

    const backend = createE2eeBackend({
      auth: createGraphqlAuth(),
      defaultStrategyId: E2eeEncryptionStrategy.Aes256Gcm,
      storage: store,
    }).registerModel(
      "notes",
      defineClientModel({
        adapter,
        schema: noteModel,
      }),
    );

    const attempt = await backend.loginWithPassword("Ops@Example.com", "top-secret-password");
    expect(attempt.result.ok).toBe(true);
    expect(backend.getSnapshot()).toEqual({
      hasEncryptionKey: true,
      hasPassword: true,
      hasRestoredState: true,
      storageStrategy: E2eeBackendStorageStrategy.Custom,
      userEmail: "ops@example.com",
    });

    const created = await backend.getClient("notes").create({
      id: "note-1",
      name: "Primary",
      secret: "Encrypted note",
    });

    expect(created).toEqual({
      id: "note-1",
      name: "Primary",
      secret: "Encrypted note",
    });
    expect(adapter.items.get("note-1")?.secretEnvelope).toMatchObject({
      algorithm: E2eeEncryptionStrategy.Aes256Gcm,
    });

    const restoredBackend = createE2eeBackend({
      storage: store,
    }).registerModel(
      "notes",
      defineClientModel({
        adapter,
        schema: noteModel,
      }),
    );

    await expect(restoredBackend.getClient("notes").getById("note-1")).resolves.toEqual({
      id: "note-1",
      name: "Primary",
      secret: "Encrypted note",
    });
    expect(restoredBackend.getPassword()).toBe("top-secret-password");
  });

  it("supports lazily created services and clears managed state on logout", async () => {
    const store = new SharedStore();
    const backend = createE2eeBackend({
      auth: createRestAuth(),
      defaultStrategyId: E2eeEncryptionStrategy.Aes256Gcm,
      storage: store,
    }).registerService("externalApis", () => ({
      example: {
        listProjects: async () => [{ id: "project-1", name: "Inbox" }],
      },
    }));

    await backend.registerWithPassword("ops@example.com", "top-secret-password");

    const first = backend.getService("externalApis");
    const second = backend.getService("externalApis");
    expect(first).toBe(second);
    await expect(first.example.listProjects()).resolves.toEqual([
      { id: "project-1", name: "Inbox" },
    ]);

    await backend.logout();

    expect(backend.getSnapshot()).toEqual({
      hasEncryptionKey: false,
      hasPassword: false,
      hasRestoredState: true,
      storageStrategy: E2eeBackendStorageStrategy.Custom,
      userEmail: null,
    });
    expect(store.load()).toBeNull();
  });
});