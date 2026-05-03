# e2ee-client-backend

Browser-first TypeScript client backend for end-to-end encrypted frontend data access.

## Quick Start

The intended default entrypoint is `E2eeBackend` plus a generated schema file exported by `e2ee-backend-adapter`.

If you want one stateful object to own password auth, browser storage, context resolution, model registration, and lazy client creation, use `E2eeBackend`. That higher-level API is documented in `docs/user/e2ee-backend.md`.

Minimal GraphQL and REST `E2eeBackend` examples are documented in `docs/user/e2ee-backend.md` and `docs/user/getting-started.md`.

Recommended default:

- export `expected-schema.json` from `e2ee-backend-adapter`
- load that file in the browser client
- build entity schemas with `createEntitySchemasFromGeneratedSchemaFile(...)`
- build default REST CRUD adapters with `createRestCrudAdaptersFromGeneratedSchemaFile(...)` when the generated schema targets REST
- use handwritten `defineEntityModel(...)` only when you need custom client-only behavior that the generated schema cannot describe

Backend adapter documentation for generating that file is available at <https://benedikt-weyer.github.io/e2ee-backend-adapter/>.

Those examples show the full shape of:

- built-in `auth` configuration that lets `E2eeBackend` create the password auth adapter internally
- a `GraphqlCrudAdapter` built on `createGraphqlTransport(...)`
- a `RestCrudAdapter` built on `createFetchRestTransport(...)`
- `createE2eeBackend(...)` using the same model with either protocol

Use this path unless you explicitly need lower-level repository wiring. If you only want repository construction without the stateful orchestration layer, use `createEntityClient(...)` directly instead.

## What is implemented

- Adapter interfaces for GraphQL and REST backends.
- A LokiJS-backed in-memory cache for decrypted entities.
- A higher-level client factory that builds repositories or custom per-model services from one `models` object.
- A highest-level `E2eeBackend` orchestration layer that can manage password auth, browser storage, context resolution, and lazy model or service registration.
- A generic encrypted-field repository layer that behaves like a small frontend ORM.
- AES-256-GCM encryption compatible with the current dashboard flow.
- A WASM-backed post-quantum envelope strategy using ML-KEM-768 plus AES-256-GCM.
- Entity schemas for dashboard blobs and partial-field integration records.
- Legacy blob compatibility helpers so existing dashboard ciphertext plus nonce pairs can still be used.
- Unit tests for strategies, repositories, and transports.

## Package layout

- `src/adapters` contains transport and CRUD adapter abstractions.
- `src/cache` contains the LokiJS cache store.
- `src/client-factory` contains the one-shot client assembly helpers.
- `src/compat` contains helpers for the dashboard's current ciphertext plus nonce format.
- `src/crypto` contains key derivation and encryption strategies.
- `src/repositories` contains the generic encrypted entity repository.
- `src/schemas` contains reusable entity mappings.

## Dashboard integration

The dashboard web app consumes this package through a local file dependency. The current integration already uses the package for:

- password-derived key material
- dashboard and integration config blob encryption and decryption
- generic external E2EE API interfaces and REST transport primitives consumed by local provider modules
- the higher-level models-to-client factory flow in `apps/web/src/lib/client-backend.ts`

The dashboard backend still stores integrations as one encrypted blob today. The package already supports partial-field encryption, but the backend migration for true partial-field storage still needs to be completed in a later iteration.

## Commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm next-version
pnpm publish:npm -- --dry-run
python -m pip install -r docs/requirements.txt
mkdocs serve
mkdocs build --strict
```

## Documentation

The repository includes a single MkDocs site with two audiences separated into different guides:

- `docs/user-guide.md` for package consumers
- `docs/developer-guide.md` for contributors and maintainers

Start with the factory-based quick start in `docs/user-guide.md`. The lower-level repository API is documented later in that guide under advanced usage.

Local docs workflow:

```bash
python -m pip install -r docs/requirements.txt
mkdocs serve
```

GitHub Pages deployment is handled by `.github/workflows/docs-pages.yml`.

## Publishing

Local publish flow:

```bash
pnpm publish:npm
```

The publish script in `scripts/publish-npm.sh` always runs build, type-check, and test before calling `npm publish` against the public npm registry. Pass through extra `npm publish` flags after `--`, for example `pnpm publish:npm -- --dry-run`.

For local publishing outside GitHub Actions, authenticate with npm first by running `npm login`, or export `NPM_TOKEN` or `NODE_AUTH_TOKEN` in your shell before running the publish script.

## GitHub release workflow

The repository includes a manual workflow at `.github/workflows/release-npm.yml`.

- Trigger it with `workflow_dispatch` from the GitHub Actions UI.
- Choose whether the next release should bump `patch`, `minor`, or `major`.
- The workflow calculates the next version from the latest semantic git tag.
- If no semantic tag exists yet, it falls back to the current `package.json` version and increments from there.
- It updates `package.json` in the workflow workspace, tries npm Trusted Publishing first, optionally retries with `NPM_TOKEN` if that fallback secret exists, and only after a successful publish creates the release commit, creates the `vX.Y.Z` git tag, and pushes both back to GitHub.

## Trusted Publishing

The release workflow is configured for GitHub Actions OIDC Trusted Publishing:

- The workflow already requests `id-token: write` in `.github/workflows/release-npm.yml`.
- The publish script automatically adds `--provenance` when it runs inside GitHub Actions.
- Once Trusted Publishing is configured in npm, the GitHub workflow should succeed without `NPM_TOKEN`; the token is now used only as an explicit fallback retry.

To enable Trusted Publishing on npmjs:

1. Sign in to npmjs with the account that owns `e2ee-client-backend`.
2. Open the npm settings for the package `e2ee-client-backend` and go to the Trusted publishers section.
3. Add a GitHub Actions trusted publisher for this repository.
4. Use these values:
	- GitHub repository owner: `benedikt-weyer`
	- GitHub repository name: `e2ee-client-backend`
	- Workflow file: `release-npm.yml`
	- Environment: leave empty unless you later protect releases with a GitHub environment
5. Save the trusted publisher configuration in npm.
6. Trigger the `Release npm Package` workflow from GitHub Actions.

If GitHub Actions fails with `E404 Not Found - PUT https://registry.npmjs.org/e2ee-client-backend` for an existing package, that usually means the npm package does not yet trust this repository and workflow as a Trusted Publisher, or that the publish credentials do not own the package.

If the package does not exist on npm yet and npm does not let you configure Trusted Publishing before the first release, publish the first version manually with `npm login` or `NPM_TOKEN`, then switch the GitHub workflow over to Trusted Publishing for all later releases.

Optional fallback secret:

- `NPM_TOKEN`: optional fallback for token-based publishing. The release workflow now tries OIDC first and only uses this token on a retry if the first publish attempt fails.
