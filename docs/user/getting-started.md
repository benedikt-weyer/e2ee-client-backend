# Getting Started

## Installation

Install the package from npm:

```bash
npm install e2ee-client-backend
```

With pnpm:

```bash
pnpm add e2ee-client-backend
```

## Runtime Expectations

The package is designed for browser-first usage.

- Node.js 20 or newer is required for local development and build tooling.
- Browser crypto APIs are expected when encrypting and decrypting records at runtime.
- Plaintext caching is intentionally client-side only.

## Typical Flow

Most integrations follow this order:

1. Define a model with the field builder API.
2. Mark the fields that should be end-to-end encrypted.
3. Build CRUD adapters over GraphQL or REST.
4. Create one `E2eeBackend` instance for the app.
5. Let the backend manage auth, secret persistence, and context injection.
6. Fetch generated model clients from that backend in application code.

## Recommended Default

For most browser applications, start with `E2eeBackend`.

That gives you one object that can own:

- password-based auth flows
- browser storage of the managed secret state
- automatic encryption key injection through the internal `contextResolver`
- lazy model client creation
- optional app-level service registration

Use `createEntityClient(...)` directly only when you want repository construction without the stateful orchestration layer.

## Minimal E2eeBackend Example

```ts
import {
  E2eeBackendStorageStrategy,
  createAes256GcmStrategy,
  createE2eeBackend,
  createStrategyRegistry,
  defineClientModel,
  defineEntityModel,
  field,
} from "e2ee-client-backend";

const noteModel = defineEntityModel({
  cacheCollection: "notes",
  defaultStrategyId: "aes-256-gcm",
  fields: {
    id: field.string(),
    title: field.string(),
    content: field.string().encrypted(),
  },
  idField: "id",
  name: "note",
});

const backend = createE2eeBackend({
  authAdapter,
  models: {
    notes: defineClientModel({
      adapter,
      schema: noteModel,
    }),
  },
  storage: E2eeBackendStorageStrategy.LocalStorage,
  storageKey: "my-app.e2ee.v1",
  strategies: createStrategyRegistry(createAes256GcmStrategy()),
});

await backend.loginWithPassword("ops@example.com", "top-secret-password");

const notes = backend.getClient("notes");

await notes.create({
  content: "Encrypted text",
  id: crypto.randomUUID(),
  title: "First note",
});
```

This is the intended browser-app entrypoint. You do not provide a manual `contextResolver`; the backend manages the active encryption key and injects it automatically for encrypted repository operations.

## What You Get By Default

The `E2eeBackend` path gives you a few things automatically:

- encrypted field handling in one place instead of scattering crypto logic through the app
- runtime validation from the field builder definitions
- configurable secret persistence through local storage, session storage, memory, or a custom store
- a LokiJS-backed plaintext cache unless you override cache behavior
- a clean path to expose either the raw repository client or higher-level services from one root object

If you want the full orchestration API surface, continue to [E2eeBackend](e2ee-backend.md).

If you want to go deeper into field mapping and validation, continue to [Modeling Entities](modeling-entities.md).