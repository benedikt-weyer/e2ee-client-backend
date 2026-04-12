# e2ee-client-backend

Browser-first TypeScript client backend for end-to-end encrypted frontend data access.

## Quick Start

The intended entrypoint is `E2eeBackend` plus the model builder.

If you want one stateful object to own password auth, browser storage, context resolution, model registration, and lazy client creation, use `E2eeBackend`. That higher-level API is documented in `docs/user/e2ee-backend.md`.

```ts
import {
	type CrudAdapter,
	E2eeEncryptionStrategy,
	E2eeBackendStorageStrategy,
	type EncryptedFieldValue,
	type PasswordAuthAdapter,
	createAes256GcmStrategy,
	createE2eeBackend,
	createStrategyRegistry,
	defineClientModel,
	defineEntityModel,
	field,
} from "e2ee-client-backend";

type SessionUser = {
	email: string;
	id: string;
};

type DashboardRemoteRecord = {
	id: string;
	name: string;
	secretFilterEnvelope: EncryptedFieldValue | null;
};

const authAdapter: PasswordAuthAdapter<SessionUser> = {
	async getKdfSalt(email) {
		const response = await fetch(`/api/auth/kdf-salt?email=${encodeURIComponent(email)}`);
		const data = await response.json();
		return data.kdfSaltBase64;
	},
	async login(email, authKeyMaterialHex) {
		const response = await fetch("/api/auth/login", {
			body: JSON.stringify({ authKeyMaterialHex, email }),
			headers: { "content-type": "application/json" },
			method: "POST",
		});
		return response.json();
	},
	async logout() {
		await fetch("/api/auth/logout", { method: "POST" });
		return true;
	},
	async refresh() {
		const response = await fetch("/api/auth/refresh", { method: "POST" });
		return response.json();
	},
	async registerBegin(email) {
		const response = await fetch("/api/auth/register-begin", {
			body: JSON.stringify({ email }),
			headers: { "content-type": "application/json" },
			method: "POST",
		});
		return response.json();
	},
	async registerComplete(email, authKeyMaterialHex) {
		const response = await fetch("/api/auth/register-complete", {
			body: JSON.stringify({ authKeyMaterialHex, email }),
			headers: { "content-type": "application/json" },
			method: "POST",
		});
		return response.json();
	},
	};

const adapter: CrudAdapter<DashboardRemoteRecord, string> = {
	async create(input) {
		const response = await fetch("/api/dashboards", {
			body: JSON.stringify(input),
			headers: { "content-type": "application/json" },
			method: "POST",
		});
		return response.json();
	},
	async delete(id) {
		await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
	},
	async getById(id) {
		const response = await fetch(`/api/dashboards/${id}`);
		if (response.status === 404) {
			return null;
		}
		return response.json();
	},
	async list() {
		const response = await fetch("/api/dashboards");
		return response.json();
	},
	async update(id, input) {
		const response = await fetch(`/api/dashboards/${id}`, {
			body: JSON.stringify(input),
			headers: { "content-type": "application/json" },
			method: "PUT",
		});
		return response.json();
	},
	};

const dashboardModel = defineEntityModel({
	cacheCollection: "dashboards",
	fields: {
		id: field.string(),
		name: field.string(),
		secretFilter: field.string().nullable().encrypted(),
	},
	idField: "id",
	name: "dashboard",
});

const backend = createE2eeBackend({
	authAdapter,
	defaultStrategyId: E2eeEncryptionStrategy.Aes256Gcm,
	models: {
		dashboards: defineClientModel({
			adapter,
			schema: dashboardModel,
		}),
	},
	storage: E2eeBackendStorageStrategy.LocalStorage,
	storageKey: "dashboard.e2ee.v1",
	strategies: createStrategyRegistry(createAes256GcmStrategy()),
});

await backend.loginWithPassword("ops@example.com", "top-secret-password");

const dashboards = backend.getClient("dashboards");

await dashboards.create({
	id: crypto.randomUUID(),
	name: "Main dashboard",
	secretFilter: null,
});
```

`authAdapter` and `adapter` are app-provided integrations. They are the parts that talk to your real auth endpoints and CRUD API.

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
