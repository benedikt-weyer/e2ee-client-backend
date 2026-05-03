# Modeling Entities

## Why The Model Builder Exists

`defineEntityModel(...)` sits above the raw repository schema interface and lets you describe a model in one place.

Use it when you want a manual schema definition. For most app integrations, prefer the generated schema file exported by `e2ee-backend-adapter` and load it with `createEntitySchemasFromGeneratedSchemaFile(...)`.

That model definition is used to derive:

- local entity validation
- remote payload validation
- encrypted field metadata
- entity-to-remote and remote-to-entity mapping

## Basic Field Types

Primitive builders validate out of the box.

Typical examples:

- `field.string()`
- `field.boolean()`
- `field.number()`
- `field.json(z.object(...))`

Use `field.json(...)` for structured values whenever possible so invalid data is rejected before encrypting and after decrypting.

## Encrypted Fields

Call `.encrypted()` on any field that should be stored as ciphertext on the remote side.

```ts
import { E2eeEncryptionStrategy } from "e2ee-client-backend";

const settingsModel = defineEntityModel({
  fields: {
    id: field.string(),
    displayName: field.string(),
    preferences: field
      .json(preferencesSchema)
      .encrypted({ strategyId: E2eeEncryptionStrategy.Aes256Gcm }),
  },
  idField: "id",
  name: "settings",
});
```

Important behavior:

- unencrypted fields are passed through directly
- encrypted fields are serialized before encryption and parsed after decryption
- the repository chooses the field strategy from `strategyId` or the schema default strategy

When you use `E2eeBackend`, the backend can inject that schema default once for all registered models through `createE2eeBackend({ defaultStrategyId: ... })`.

## Remote Field Names

Use `.remote("remoteFieldName")` when the local entity field name should not match the backend field name.

```ts
const dashboardModel = defineEntityModel({
  fields: {
    config: field.json(configSchema).remote("configEnvelope").encrypted(),
    id: field.string(),
    name: field.string(),
  },
  idField: "id",
  name: "dashboard",
});
```

This is useful when integrating with an existing backend shape you do not want to rename immediately.

## Nullability And Optional Shapes

The field builder is explicit about nullability. If a field can be `null`, mark it with `.nullable()`.

That keeps entity validation, remote validation, and encrypted serialization behavior aligned.

## Custom Per-Model Services

If a model needs an app-facing surface beyond CRUD, use `defineClientModel({ setup(...) { ... } })`.

```ts
const client = createEntityClient({
  contextResolver,
  models: {
    dashboards: defineClientModel({
      adapter,
      schema: dashboardModel,
      setup({ repository }) {
        return {
          createNamed(name: string) {
            return repository.create({
              config: null,
              id: crypto.randomUUID(),
              name,
            });
          },
          repository,
        };
      },
    }),
  },
  strategies,
});
```

This keeps custom app workflows close to the model while reusing the repository implementation underneath.

## Built-In Schemas

If you prefer package-provided shapes, helpers like `createIntegrationSchema()` and `createDashboardSchema()` are still available.

Use them when you want a ready-made starting point instead of defining models from scratch.

If you already generate `expected-schema.json` from `e2ee-backend-adapter`, prefer that generated file over both built-in schemas and handwritten `defineEntityModel(...)` definitions.