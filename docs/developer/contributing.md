# Contributing

## Local Development

Install dependencies:

```bash
pnpm install
```

Main validation commands:

```bash
pnpm build
pnpm typecheck
pnpm test
```

## Change Discipline

When making package changes:

- keep public exports in `src/index.ts` intentional and minimal
- prefer interface-driven abstractions over app-specific hard-coding
- keep crypto, transport, auth, and UI concerns decoupled
- update docs when public APIs or workflows change
- validate with build, typecheck, and test before publishing

## Docs Expectations

Consumer-facing docs should lead with the model builder and client factory.

If you add or change a lower-level API, document it as advanced usage unless it becomes part of the default consumer path.