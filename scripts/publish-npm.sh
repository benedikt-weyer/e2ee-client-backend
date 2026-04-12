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

npm publish "${publish_args[@]}"