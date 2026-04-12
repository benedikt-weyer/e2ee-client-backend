# Advanced Usage

## When To Drop Below The Client Factory

The top-level `createEntityClient(...)` API should be the default for most applications.

Use direct repository wiring only when you need lower-level control, such as:

- manually choosing cache instances at a specific call site
- working directly with `EntitySchema` contracts
- integrating with a partially custom model pipeline the factory does not express cleanly

## Direct Repository Wiring Example

```ts
import {
  E2eeEncryptionStrategy,
  createAes256GcmStrategy,
  createEntityRepository,
  createLokiCacheStore,
  createStrategyRegistry,
  defineEntityModel,
  field,
} from "e2ee-client-backend";

const dashboardSchema = defineEntityModel({
  cacheCollection: "dashboards",
  defaultStrategyId: E2eeEncryptionStrategy.Aes256Gcm,
  fields: {
    id: field.string(),
    name: field.string(),
    secretFilter: field.string().nullable().encrypted(),
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
  schema: dashboardSchema,
  strategies: createStrategyRegistry(createAes256GcmStrategy()),
});
```

## Cache Control

The client factory creates a LokiJS-backed cache by default. If you need different behavior, provide `cache: null`, a custom `cache`, or a `cacheFactory` at client creation time.

That is useful when:

- a model should never cache plaintext
- multiple models should share a custom cache strategy
- tests should use a predictable cache implementation

## Lower-Level Schema Contracts

The raw `EntitySchema` interface remains the escape hatch for behavior that does not fit the builder.

Use it carefully. Once you bypass the model builder, you are responsible for keeping local validation, remote mapping, and encrypted field policy coherent.