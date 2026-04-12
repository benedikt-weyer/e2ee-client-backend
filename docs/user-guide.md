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

1. Create or choose a crypto strategy.
2. Create a strategy registry.
3. Define or reuse an entity schema.
4. Build a CRUD adapter over GraphQL or REST.
5. Create a cache store.
6. Provide a context resolver that returns the encryption key.
7. Create an entity repository and use it from application code.

## Example: Repository with AES-256-GCM

```ts
import {
  createAes256GcmStrategy,
  createEntityRepository,
  createIntegrationSchema,
  createLokiCacheStore,
  createStrategyRegistry,
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
  schema: createIntegrationSchema(),
  strategies: createStrategyRegistry(createAes256GcmStrategy()),
});
```

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
