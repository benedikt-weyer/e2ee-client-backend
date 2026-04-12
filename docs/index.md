# e2ee-client-backend

`e2ee-client-backend` is a browser-first TypeScript package for building encrypted frontend data flows that still feel like working with a normal client-side backend.

It gives you four main building blocks:

- transport and CRUD adapter abstractions for GraphQL and REST backends
- an in-memory LokiJS cache for decrypted entities
- a repository layer that encrypts only the fields you mark as encrypted
- pluggable crypto strategies, including AES-256-GCM and an ML-KEM-based envelope strategy

## Who This Is For

Use the package if you need to:

- keep plaintext data only in the browser
- store encrypted payloads or selected encrypted fields on a backend
- support multiple backend transport styles without rewriting the domain layer
- keep a frontend-friendly repository API instead of hand-writing encryption logic in every component

## Core Concepts

### Repositories

The repository layer turns remote records into local entities and handles encryption and decryption for configured fields.

### Schemas

Schemas describe how an entity maps to the remote record and which fields should be encrypted.

### Strategies

Strategies encapsulate the actual encryption implementation. The package already includes AES-256-GCM and ML-KEM plus AES-256-GCM.

### Context Resolvers

A context resolver provides the per-request crypto material, such as the current encryption key.

## Package Surface

The package exports modules for:

- adapters
- auth helpers for password-derived login flows
- cache storage
- compatibility helpers for legacy encrypted JSON blobs
- crypto strategies and key derivation
- generic external E2EE API client interfaces
- repositories
- dashboard and integration schemas

## Documentation Map

Start here depending on what you need:

- [Getting Started](user/getting-started.md) for the shortest path from install to a working encrypted client.
- [Modeling Entities](user/modeling-entities.md) for the Prisma-like model builder, encrypted field configuration, and validation behavior.
- [Adapters and Transports](user/adapters-and-transports.md) for GraphQL and REST integration patterns.
- [Crypto, Auth, and Compatibility](user/crypto-auth-and-compat.md) for strategy selection, password-derived auth flows, and legacy blob migration.
- [Advanced Usage](user/advanced-usage.md) for direct repository wiring and lower-level schema control.
- [Architecture](developer/architecture.md) for package internals and layer boundaries.
- [Contributing](developer/contributing.md) for local workflow and validation expectations.
- [Release and Docs](developer/release-and-docs.md) for npm publishing and MkDocs deployment.

See the [User Guide overview](user-guide.md) to start consuming the package, or the [Developer Guide overview](developer-guide.md) if you are working on the package itself.
