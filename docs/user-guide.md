# User Guide

The user documentation is now split into focused subpages so the package can be learned in layers instead of one long document.

## Suggested Reading Order

1. [Getting Started](user/getting-started.md) for installation, runtime expectations, and the shortest working example.
2. [Modeling Entities](user/modeling-entities.md) for field definitions, encrypted field flags, validation, and custom services.
3. [Adapters and Transports](user/adapters-and-transports.md) for protocol integration over GraphQL or REST.
4. [Crypto, Auth, and Compatibility](user/crypto-auth-and-compat.md) for crypto strategy selection, auth helpers, and legacy blob migration.
5. [Advanced Usage](user/advanced-usage.md) if you need to bypass the top-level client factory.

## Recommended Default

Prefer `defineEntityModel(...)` plus `createEntityClient(...)` for new work.

That path gives you:

- one place to declare local and remote field mapping
- runtime validation before encrypting and after decrypting
- per-model repository generation from a single `models` object
- an easy upgrade path to custom model-specific service surfaces

Reach for direct `createEntityRepository(...)` wiring only if you need lower-level control than the factory API allows.

That path is appropriate when:

- you need hybrid encryption semantics
- you can carry the extra WASM dependency in the browser
- your threat model justifies the extra complexity
