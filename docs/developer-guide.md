# Developer Guide

## Repository Layout

The package source is organized by responsibility:

- `src/adapters`: GraphQL and REST transport plus CRUD adapter abstractions
- `src/auth`: password-based client auth helpers
- `src/cache`: LokiJS cache implementation
- `src/compat`: compatibility helpers for legacy encrypted blobs
- `src/crypto`: encryption strategies, key derivation, and crypto types
- `src/encoding`: byte and base64 helpers
- `src/external-e2ee`: generic interfaces for external encrypted API clients
- `src/repositories`: the encrypted entity repository layer
- `src/schemas`: reusable entity schemas
- `tests`: Vitest coverage for the public building blocks

## Local Development

Install dependencies:

```bash
pnpm install
```

Main package validation commands:

```bash
pnpm build
pnpm typecheck
pnpm test
```

## Documentation Development

Install MkDocs dependencies:

```bash
python -m pip install -r docs/requirements.txt
```

Run the docs locally:

```bash
mkdocs serve
```

Build the static site:

```bash
mkdocs build --strict
```

## Release Flow

The package includes a scripted npm release flow:

- `pnpm next-version` prints the next semver based on the latest semantic git tag
- `pnpm publish:npm` builds, type-checks, tests, and then publishes to npmjs

The release workflow in `.github/workflows/release-npm.yml` is manually triggerable and performs these steps:

1. resolves the next version from the latest semantic tag
2. updates `package.json`
3. commits the release bump
4. creates a `vX.Y.Z` tag
5. publishes to npmjs
6. pushes the commit and tag back to GitHub

## GitHub Pages Docs Deployment

The docs site is built with MkDocs and deployed to GitHub Pages through GitHub Actions.

The workflow:

- installs Python
- installs `mkdocs` and `mkdocs-material`
- builds the site with `mkdocs build --strict`
- uploads the generated site as a Pages artifact
- deploys it with the official GitHub Pages deploy action

## Contribution Notes

When making package changes:

- keep public exports in `src/index.ts` intentional and minimal
- prefer interface-driven abstractions over hard-coding app-specific providers
- keep crypto and transport code decoupled from UI concerns
- update docs when public APIs or release steps change
- validate with build, typecheck, and test before publishing
