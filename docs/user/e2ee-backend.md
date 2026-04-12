# E2eeBackend

## What It Is

`E2eeBackend` is the highest-level package API.

Use it when you do not want to manually wire together:

- password-auth flows
- browser persistence for managed secrets
- a `contextResolver` that injects the active encryption key
- model registration
- client lookup and lazy service creation

It sits above `defineEntityModel(...)` and `createEntityClient(...)` and gives you one long-lived stateful object for the frontend.

## What It Manages

An `E2eeBackend` instance can manage these concerns together:

- password-based login and registration through a `PasswordAuthAdapter`
- storage of the managed password and derived encryption key
- automatic `contextResolver.resolve(...)` key injection for encrypted fields
- registration of model-backed clients
- registration of arbitrary lazily created services

That makes it a good fit for browser applications that want one E2EE entrypoint rather than several smaller primitives.

## Storage Strategy

The browser persistence strategy is configurable through the `E2eeBackendStorageStrategy` enum.

Available options:

- `E2eeBackendStorageStrategy.LocalStorage`
- `E2eeBackendStorageStrategy.SessionStorage`
- `E2eeBackendStorageStrategy.Memory`
- a custom store implementing `load()` and `save()`

The package default is local storage.

## Minimal Example

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

The important point is that you never provide a manual `contextResolver`. The backend stores the managed encryption key and injects it automatically when repository operations need to encrypt or decrypt fields.

## Auth Flow

If you provide a `PasswordAuthAdapter`, `E2eeBackend` exposes the same high-level auth operations directly:

- `beginRegistration(email)`
- `completeRegistrationWithPassword(email, password, kdfSaltBase64)`
- `registerWithPassword(email, password)`
- `loginWithPassword(email, password)`
- `refreshSession()`
- `logout()`

Successful password-based auth stores the managed password and derived encryption key according to the configured storage strategy.

## Model Registration

You can register models either during creation or later.

Creation-time registration is best when you want strong inference from the initial object literal.

```ts
const backend = createE2eeBackend({
  models: {
    notes: defineClientModel({ adapter, schema: noteModel }),
  },
});
```

Runtime registration is useful when models are assembled in steps.

```ts
const backend = createE2eeBackend();

backend.registerModel(
  "notes",
  defineClientModel({ adapter, schema: noteModel }),
);
```

Use `getClient("notes")` to retrieve the lazily created model client.

## Service Registration

You can also register non-repository services on the same object.

```ts
backend.registerService("externalApis", () => ({
  plandera: createPlanderaExternalApiClient(),
}));

const externalApis = backend.getService("externalApis");
```

This is useful for app-level provider registries, external datasource clients, or other services that should be created from the same root backend object.

## When To Use Lower-Level APIs

Use `E2eeBackend` when you want one object to own the application E2EE workflow.

Drop to lower-level APIs when:

- you want repository construction without managed auth or browser storage
- you want explicit control over `contextResolver`
- you are building a library and do not want a stateful browser-oriented abstraction

In those cases, use `createEntityClient(...)` or `createEntityRepository(...)` directly.