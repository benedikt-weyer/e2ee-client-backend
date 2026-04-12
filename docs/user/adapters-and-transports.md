# Adapters and Transports

## Layering

The package keeps protocol code separate from entity and crypto logic.

The general flow is:

1. a transport knows how to talk to a backend protocol
2. a CRUD adapter translates repository operations into transport calls
3. the repository or client factory uses that adapter to persist models

## GraphQL

Use the GraphQL helpers when your backend already exposes mutations and queries.

- `createGraphqlTransport` wraps an executor function
- `GraphqlCrudAdapter` maps repository CRUD operations onto GraphQL documents

This keeps model logic independent from GraphQL document execution details.

## REST

Use the REST helpers when your backend is route-oriented.

- `createFetchRestTransport` builds a transport on top of `fetch`
- `RestCrudAdapter` maps CRUD operations onto HTTP routes

This is the right fit when endpoints already exist and you want the encrypted entity layer to stay protocol-agnostic.

## Adapter Design Guidance

Keep adapters focused on remote I/O.

Adapters should not:

- know about encryption internals
- derive crypto keys
- contain UI-specific transformation logic

Adapters should:

- accept and return remote record shapes
- expose clear `create`, `getById`, `list`, `update`, and `delete` semantics
- stay small enough that protocol changes do not leak into the rest of the app

## Caching Behavior

The repository handles the decrypted client-side cache. Adapters should behave as if every request is authoritative remote I/O.

That separation matters because:

- cache policy stays consistent across GraphQL and REST
- encryption stays in one layer
- transport code remains easier to test in isolation