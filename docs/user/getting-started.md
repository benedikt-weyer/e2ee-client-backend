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
4. Create or choose a crypto strategy.
5. Create one entity client from a `models` object.
6. Use the generated repositories or custom per-model services from application code.

## Minimal Factory Example

```ts
import {
  createAes256GcmStrategy,
  createEntityClient,
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

const client = createEntityClient({
  contextResolver: {
    async resolve() {
      return {
        key: crypto.getRandomValues(new Uint8Array(32)),
      };
    },
  },
  models: {
    notes: defineClientModel({
      adapter,
      schema: noteModel,
    }),
  },
  strategies: createStrategyRegistry(createAes256GcmStrategy()),
});

await client.notes.create({
  content: "Encrypted text",
  id: crypto.randomUUID(),
  title: "First note",
});
```

## What You Get By Default

The factory-based path gives you a few things automatically:

- encrypted field handling in one place instead of scattering crypto logic through the app
- runtime validation from the field builder definitions
- a LokiJS-backed plaintext cache unless you override cache behavior
- a clean path to expose either the raw repository or a custom service per model

Continue to [Modeling Entities](modeling-entities.md) for field mapping and validation details.