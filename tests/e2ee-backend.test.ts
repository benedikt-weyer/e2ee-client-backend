import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { CrudAdapter } from "../src/adapters/contracts";
import type { PasswordAuthAdapter } from "../src/auth/password-auth-client";
import {
  E2eeBackendStorageStrategy,
  createE2eeBackend,
} from "../src/e2ee-backend";
import type { EncryptedFieldValue } from "../src/crypto/types";
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

function createAuthAdapter(): PasswordAuthAdapter<{ email: string }> {
  return {
    async getKdfSalt() {
      return saltBase64;
    },
    async login(email) {
      return { ok: true, user: { email } };
    },
    async logout() {
      return true;
    },
    async refresh() {
      return { ok: true, user: { email: "ops@example.com" } };
    },
    async registerBegin() {
      return { kdfSaltBase64: saltBase64 };
    },
    async registerComplete(email) {
      return { ok: true, user: { email } };
    },
  };
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
      defaultStrategyId: "aes-256-gcm",
      fields: {
        id: field.string(),
        name: field.string(),
        secret: field.string().remote("secretEnvelope").encrypted(),
      },
      idField: "id",
      name: "note",
    });

    const backend = createE2eeBackend({
      authAdapter: createAuthAdapter(),
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
      algorithm: "aes-256-gcm",
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
      authAdapter: createAuthAdapter(),
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