# User Guide

## Installation

Install the published package from npm:

```bash
npm install e2ee-client-backend
```

With pnpm:

```bash
pnpm add e2ee-client-backend
```

## Runtime Expectations

The package is designed for browser-first usage.

- Node.js 20 or newer is required for package development and build tooling.
- Browser crypto APIs are expected for runtime encryption work.
- Plaintext caching is intentionally client-side only.

## Typical Usage Flow

Most integrations follow this order:

1. Define a model with the field builder API.
2. Mark the fields that should be end-to-end encrypted.
3. Create or choose a crypto strategy.
4. Create a strategy registry.
5. Build a CRUD adapter over GraphQL or REST.
6. Create a cache store.
7. Provide a context resolver that returns the encryption key.
8. Create an entity repository and use it from application code.

## Preferred Model API

The simplest package entrypoint is `defineEntityModel`.

It lets you describe the entity in one place, similar to a Prisma model, and mark encrypted fields inline.

```ts
import { z } from "zod";
import {
  createAes256GcmStrategy,
  createEntityRepository,
  createLokiCacheStore,
  createStrategyRegistry,
  defineEntityModel,
  field,
} from "e2ee-client-backend";

const dashboardModel = defineEntityModel({
  cacheCollection: "dashboards",
  defaultStrategyId: "aes-256-gcm",
  fields: {
    id: field.string(),
    name: field.string(),
    config: field
      .json(
        z.object({
          layout: z.enum(["grid", "list"]),
          showFilters: z.boolean(),
        }),
      )
      .nullable()
      .remote("configEnvelope")
      .encrypted(),
  },
  idField: "id",
  name: "dashboard",
});

const repository = createEntityRepository({
  adapter,
  cache: createLokiCacheStore(),
  contextResolver: {
    async resolve() {
      return {
        key: crypto.getRandomValues(new Uint8Array(32)),
      };
    },
  },
  schema: dashboardModel,
  strategies: createStrategyRegistry(createAes256GcmStrategy()),
});
```

This layer adds runtime validation automatically.

- Primitive builders like `field.string()` and `field.boolean()` validate out of the box.
- Structured values should use `field.json(z.object(...))` so the package can validate before encrypting and after decrypting.
- `remote("configEnvelope")` lets the local entity key differ from the backend field name.
- `encrypted()` marks the field for repository-managed encryption.

## Example: Repository with AES-256-GCM

```ts
import {
  createAes256GcmStrategy,
  createEntityRepository,
  createLokiCacheStore,
  createStrategyRegistry,
  defineEntityModel,
  field,
  type CrudAdapter,
  type IntegrationRemoteRecord,
} from "e2ee-client-backend";

const adapter: CrudAdapter<IntegrationRemoteRecord, string> = {
  async create(input) {
    return input;
  },
  async delete() {},
  async getById() {
    return null;
  },
  async list() {
    return [];
  },
  async update(_id, input) {
    return input;
  },
};

const integrationModel = defineEntityModel({
  cacheCollection: "integrations",
  defaultStrategyId: "aes-256-gcm",
  fields: {
    apiUrl: field.string(),
    authHash: field.string().nullable().encrypted(),
    displayName: field.string(),
    id: field.string(),
    provider: field.string(),
  },
  idField: "id",
  name: "integration",
});

const repository = createEntityRepository({
  adapter,
  cache: createLokiCacheStore(),
  contextResolver: {
    async resolve() {
      return {
        key: crypto.getRandomValues(new Uint8Array(32)),
      };
    },
  },
  schema: integrationModel,
  strategies: createStrategyRegistry(createAes256GcmStrategy()),
});
```

If you prefer the package-provided schemas, helpers like `createIntegrationSchema()` and `createDashboardSchema()` still work.

## GraphQL and REST Adapters

Use the transport helpers when you want the domain layer to stay independent of the backend protocol.

- `createGraphqlTransport` wraps a GraphQL executor function.
- `GraphqlCrudAdapter` maps repository CRUD operations onto GraphQL documents.
- `createFetchRestTransport` builds a REST transport on top of `fetch`.
- `RestCrudAdapter` maps CRUD operations onto HTTP routes.

## Password-Based Client Auth

The package also includes helpers for browser-side password derivation in auth flows.

Use `createPasswordAuthClient` when:

- the backend stores only password-derived auth material
- the browser derives both auth and encryption material from the password
- you want the same auth flow logic reused across apps

## Legacy Blob Helpers

If your backend still stores one encrypted JSON blob instead of separately encrypted fields, use:

- `encryptJsonToLegacyBlob`
- `decryptJsonFromLegacyBlob`
- `legacyBlobToEncryptedField`
- `encryptedFieldToLegacyBlob`

These helpers let you adopt the repository layer incrementally before the backend storage model is fully normalized.

## ML-KEM Strategy

If you want a post-quantum envelope flow, use the ML-KEM helper exports instead of the plain AES strategy.

That path is appropriate when:

- you need hybrid encryption semantics
- you can carry the extra WASM dependency in the browser
- your threat model justifies the extra complexity
