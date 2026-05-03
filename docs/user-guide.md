# User Guide

The user documentation is now split into focused subpages so the package can be learned in layers instead of one long document.

## Suggested Reading Order

1. [Getting Started](user/getting-started.md) for installation, runtime expectations, and the shortest working example.
2. [E2eeBackend](user/e2ee-backend.md) for the all-in-one stateful API that manages password auth, browser storage, and client lookup.
3. [Modeling Entities](user/modeling-entities.md) for field definitions, encrypted field flags, validation, and custom services.
4. [Adapters and Transports](user/adapters-and-transports.md) for protocol integration over GraphQL or REST.
5. [External Datasources](user/external-datasources.md) for provider modules that call third-party APIs such as task systems.
6. [Crypto, Auth, and Compatibility](user/crypto-auth-and-compat.md) for crypto strategy selection, auth helpers, and legacy blob migration.
7. [Advanced Usage](user/advanced-usage.md) if you need to bypass the higher-level orchestration layer.

## Recommended Default

Prefer `E2eeBackend` for browser applications that want the package to manage password-derived key state, browser persistence, and context injection.

For model definitions, prefer loading the generated schema file exported by `e2ee-backend-adapter` and building client schemas with `createEntitySchemasFromGeneratedSchemaFile(...)`.

Use `defineEntityModel(...)` plus `createEntityClient(...)` directly when you want the same repository and model-building behavior without the stateful orchestration layer, or when you need client-only schema behavior that is not part of the generated contract.

That path gives you:

- one place to consume backend-generated local and remote field mapping
- runtime validation before encrypting and after decrypting
- per-model repository generation from a single `models` object
- an easy upgrade path to custom model-specific service surfaces or a higher-level root backend object

Reach for direct `createEntityRepository(...)` wiring only if you need lower-level control than the factory API allows.

If your app also talks to third-party APIs with decrypted integration config, use `createExternalE2eeApiClient(...)` rather than the repository factory. That pattern is documented in [External Datasources](user/external-datasources.md).

See the backend adapter docs for the schema export flow: <https://benedikt-weyer.github.io/e2ee-backend-adapter/>.
