#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/publish-npm.sh [npm publish args...]

Builds, type-checks, and tests the package before publishing it to npmjs.
Pass through any extra npm publish arguments, for example --dry-run.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)

cd "$repo_root"

if [[ -z "${NODE_AUTH_TOKEN:-}" && -n "${NPM_TOKEN:-}" ]]; then
  export NODE_AUTH_TOKEN="$NPM_TOKEN"
fi

pnpm build
pnpm typecheck
pnpm test

publish_args=(--access public)

if [[ "${GITHUB_ACTIONS:-false}" == "true" ]]; then
  publish_args+=(--provenance)
fi

if [[ "$#" -gt 0 ]]; then
  publish_args+=("$@")
fi

if ! npm publish "${publish_args[@]}"; then
  cat >&2 <<'EOF'

npm publish failed.

If GitHub Actions returns E404 for an existing package, the usual causes are:
- npm Trusted Publishing is not configured for this repository and workflow on the package
- the package is owned by a different npm account or org than the credentials used here
- no NPM_TOKEN fallback secret is configured for token-based publishing

For this repository, check the npm package settings for `e2ee-client-backend` and verify:
- trusted publisher repository owner: `benedikt-weyer`
- trusted publisher repository name: `e2ee-client-backend`
- trusted publisher workflow file: `release-npm.yml`

If Trusted Publishing is not available yet, configure the `NPM_TOKEN` GitHub secret as a fallback.
EOF
  exit 1
fi