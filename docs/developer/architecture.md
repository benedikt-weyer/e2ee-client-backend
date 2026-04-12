# Architecture

## Layering

The package is organized in layers from lowest-level mechanics to highest-level consumer API.

1. encoding and crypto primitives
2. transport and CRUD adapter abstractions
3. repository behavior for encrypted entity persistence
4. schema and model builders
5. top-level client factory and app-facing service composition

That dependency direction matters. Higher-level layers should compose lower-level layers rather than leaking implementation details back down.

## Source Layout

The source tree is organized by responsibility:

- `src/adapters`: GraphQL and REST transport plus CRUD adapter abstractions
- `src/auth`: password-based client auth helpers
- `src/cache`: LokiJS cache implementation
- `src/client-factory.ts`: one-shot client assembly from a `models` object
- `src/compat`: compatibility helpers for legacy encrypted blobs
- `src/crypto`: encryption strategies, key derivation, and crypto types
- `src/encoding`: byte and base64 helpers
- `src/external-e2ee`: generic interfaces for external encrypted API clients
- `src/repositories`: the encrypted entity repository layer
- `src/schema-builder.ts`: Prisma-like model definitions compiled into repository schemas
- `src/schemas`: reusable entity schemas

## Preferred Public API

The intended public stack is:

- `defineEntityModel(...)`
- `defineClientModel(...)`
- `createEntityClient(...)`

That stack generates:

- `createEntity` and `createRemote` mappings
- encrypted field policies for the repository
- runtime validation for entity input and remote payloads
- repository or service instances for each model from a single `models` object

Direct `EntitySchema` and `EntityRepository` usage still exists, but should be treated as advanced functionality rather than the primary consumer story.