# Release and Docs

## npm Release Flow

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

## Docs Tooling

The documentation site is built with MkDocs and deployed to GitHub Pages through GitHub Actions.

Local setup with `uv`:

```bash
uv venv .venv-docs
uv pip install --python .venv-docs/bin/python -r docs/requirements.txt
uv run --python .venv-docs/bin/python mkdocs build --strict
```

The docs deployment workflow installs the same MkDocs toolchain, builds the site with `mkdocs build --strict`, and deploys the generated `site/` output to GitHub Pages.