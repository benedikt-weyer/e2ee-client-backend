# Developer Guide

The maintainer documentation is split into focused sections so package internals, contribution workflow, and release operations stay easier to navigate.

## Documentation Map

- [Architecture](developer/architecture.md) covers the package layers and the intended dependency direction between them.
- [Contributing](developer/contributing.md) covers local development commands, validation expectations, and change discipline.
- [Release and Docs](developer/release-and-docs.md) covers npm publishing, GitHub Actions release automation, and MkDocs workflows.

## Maintainer Defaults

Keep these rules in mind when changing the package:

- public consumer docs should lead with generated schema consumption plus `E2eeBackend`, `defineClientModel(...)`, and `createEntityClient(...)`
- `defineEntityModel(...)` should stay documented as the manual or advanced path when the generated schema contract is insufficient
- lower-level repository wiring should stay available, but documented as advanced usage
- transport, crypto, auth, and UI-specific concerns should stay decoupled
- every public API change should be reflected in docs and validated with build, typecheck, and tests

Start with [Architecture](developer/architecture.md) if you need to understand where a change belongs before editing code.
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
