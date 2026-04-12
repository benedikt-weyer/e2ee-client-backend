# e2ee-client-backend

Browser-first TypeScript client backend for end-to-end encrypted frontend data access.

## What is implemented

- Adapter interfaces for GraphQL and REST backends.
- A LokiJS-backed in-memory cache for decrypted entities.
- A generic encrypted-field repository layer that behaves like a small frontend ORM.
- AES-256-GCM encryption compatible with the current dashboard flow.
- A WASM-backed post-quantum envelope strategy using ML-KEM-768 plus AES-256-GCM.
- Entity schemas for dashboard blobs and partial-field integration records.
- Legacy blob compatibility helpers so existing dashboard ciphertext plus nonce pairs can still be used.
- Unit tests for strategies, repositories, and transports.

## Package layout

- `src/adapters` contains transport and CRUD adapter abstractions.
- `src/cache` contains the LokiJS cache store.
- `src/compat` contains helpers for the dashboard's current ciphertext plus nonce format.
- `src/crypto` contains key derivation and encryption strategies.
- `src/repositories` contains the generic encrypted entity repository.
- `src/schemas` contains reusable entity mappings.

## Dashboard integration

The dashboard web app consumes this package through a local file dependency. The current integration already uses the package for:

- password-derived key material
- dashboard and integration config blob encryption and decryption
- generic external E2EE API interfaces and REST transport primitives consumed by local provider modules
- repository bridge factories in `apps/web/src/lib/client-backend.ts`

The dashboard backend still stores integrations as one encrypted blob today. The package already supports partial-field encryption, but the backend migration for true partial-field storage still needs to be completed in a later iteration.

## Commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm next-version
pnpm publish:npm -- --dry-run
```

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
- It updates `package.json`, creates a release commit, creates a `vX.Y.Z` git tag, publishes to npmjs, and then pushes the commit and tag back to GitHub.

## Trusted Publishing

The release workflow is configured for GitHub Actions OIDC Trusted Publishing:

- The workflow already requests `id-token: write` in `.github/workflows/release-npm.yml`.
- The publish script automatically adds `--provenance` when it runs inside GitHub Actions.
- Once Trusted Publishing is configured in npm, the GitHub workflow does not need `NPM_TOKEN`.

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

If the package does not exist on npm yet and npm does not let you configure Trusted Publishing before the first release, publish the first version manually with `npm login` or `NPM_TOKEN`, then switch the GitHub workflow over to Trusted Publishing for all later releases.

Optional fallback secret:

- `NPM_TOKEN`: only needed if you want token-based publishing as a fallback or for non-OIDC environments.
