# E2eeBackend

## What It Is

`E2eeBackend` is the highest-level package API.

Use it when you do not want to manually wire together:

- password-auth flows
- browser persistence for managed secrets
- a `contextResolver` that injects the active encryption key
- model registration
- client lookup and lazy service creation

It sits above `defineEntityModel(...)` and `createEntityClient(...)` and gives you one long-lived stateful object for the frontend.

Recommended default: pair `E2eeBackend` with the generated TypeScript companion module exported by `e2ee-backend-adapter`, then import typed auth helpers, entity schemas, and REST or GraphQL CRUD adapters from that generated file.

## What It Manages

An `E2eeBackend` instance can manage these concerns together:

- password-based login and registration through built-in auth configuration
- storage of the managed password and derived encryption key
- automatic `contextResolver.resolve(...)` key injection for encrypted fields
- registration of model-backed clients
- registration of arbitrary lazily created services

That makes it a good fit for browser applications that want one E2EE entrypoint rather than several smaller primitives.

## Storage Strategy

The browser persistence strategy is configurable through the `E2eeBackendStorageStrategy` enum.

Available options:

- `E2eeBackendStorageStrategy.LocalStorage`
- `E2eeBackendStorageStrategy.SessionStorage`
- `E2eeBackendStorageStrategy.Memory`
- a custom store implementing `load()` and `save()`

The package default is local storage.

## Minimal Examples

Each example below is self-contained and can be copied independently.

### Minimal REST Example With Adapter-Generated Schema

```ts
import {
  E2eeBackendStorageStrategy,
  createE2eeBackend,
} from "e2ee-client-backend";

import {
  createRestAuthConfig,
  createRestModels,
} from "./generated/e2ee-client-bindings";

const restBackend = createE2eeBackend({
  auth: createRestAuthConfig(),
  models: createRestModels(),
  storage: E2eeBackendStorageStrategy.LocalStorage,
  storageKey: "my-app.e2ee.v1",
});

await restBackend.loginWithPassword("ops@example.com", "top-secret-password");

await restBackend.getClient("notes").create({
  content: "Encrypted text",
  id: crypto.randomUUID(),
  title: "First note",
});
```

### Minimal GraphQL Example With Adapter-Generated Schema

```ts
import {
  E2eeBackendStorageStrategy,
  createE2eeBackend,
} from "e2ee-client-backend";

import {
  createGraphqlAuthConfig,
  createGraphqlModels,
} from "./generated/e2ee-client-bindings";

const graphqlBackend = createE2eeBackend({
  auth: createGraphqlAuthConfig(),
  models: createGraphqlModels(),
  storage: E2eeBackendStorageStrategy.LocalStorage,
  storageKey: "my-app.e2ee.v1",
});

await graphqlBackend.loginWithPassword("ops@example.com", "top-secret-password");

await graphqlBackend.getClient("notes").create({
  content: "Encrypted text",
  id: crypto.randomUUID(),
  title: "First note",
});
```

This generated GraphQL path assumes the exported schema uses the built-in naming conventions for auth and CRUD operations: `kdfSalt`, `login`, `logout`, `refreshSession`, `registerBegin`, `registerComplete`, plus entity operations such as `note`, `notes`, `createNote`, `updateNote`, and `deleteNote`.

### Minimal REST Example

```ts
import {
  type ClientModelDefinition,
  E2eeEncryptionStrategy,
  type E2eeBackend,
  E2eeBackendStorageStrategy,
  type EncryptedFieldValue,
  type EntitySchema,
  type RestPasswordAuthConfig,
  type RestTransport,
  RestCrudAdapter,
  createAes256GcmStrategy,
  createE2eeBackend,
  createFetchRestTransport,
  createRestPasswordAuthConfig,
  createStrategyRegistry,
  defineClientModel,
  defineEntityModel,
  field,
} from "e2ee-client-backend";

// Reuse one REST transport for both auth endpoints and note CRUD routes.
// Set `baseUrl` to the root path served by your backend or API proxy.
const restTransport: RestTransport = createFetchRestTransport({
  baseUrl: "/api",
  defaultHeaders: {
    accept: "application/json",
  },
});

// This describes the `user` object returned by login, refresh, and registration.
// Copy this shape from your auth API response contract or REST response body.
type SessionUser = {
  email: string;
  id: string;
};

// This enables the built-in password auth flow for REST backends.
// By default the library expects `/auth/*` routes; override `endpoints` if your API differs.
const auth: RestPasswordAuthConfig<SessionUser> = createRestPasswordAuthConfig<SessionUser>({
  transport: restTransport,
});

// This describes the note payload returned by your note CRUD operations.
// Copy these fields from your REST DTO for notes.
type NoteRemoteRecord = {
  content: EncryptedFieldValue;
  id: string;
  title: string;
};

// This model defines which fields are encrypted locally before they are sent.
// The field list comes from your app's domain model, not from the auth API.
const noteModel: EntitySchema<
  { content: string; id: string; title: string },
  NoteRemoteRecord,
  string
> = defineEntityModel({
  cacheCollection: "notes",
  fields: {
    id: field.string(),
    title: field.string(),
    content: field.string().encrypted(),
  },
  idField: "id",
  name: "note",
});

// This CRUD adapter maps repository operations to your REST routes.
// Get these paths from the notes endpoints exposed by your backend.
const restAdapter: RestCrudAdapter<NoteRemoteRecord, string> = new RestCrudAdapter<NoteRemoteRecord, string>(restTransport, {
  create: { path: "/notes" },
  delete: { path: (id) => `/notes/${id}` },
  getById: { path: (id) => `/notes/${id}` },
  list: { path: "/notes" },
  update: { path: (id) => `/notes/${id}` },
});

// Create one backend so auth, key management, storage, and repositories share state.
// Pick the storage strategy that matches how long the user should stay signed in.
const restBackend: E2eeBackend<
  { notes: ClientModelDefinition<typeof noteModel> },
  SessionUser
> = createE2eeBackend({
  auth,
  defaultStrategyId: E2eeEncryptionStrategy.Aes256Gcm,
  models: {
    notes: defineClientModel({
      adapter: restAdapter,
      schema: noteModel,
    }),
  },
  storage: E2eeBackendStorageStrategy.LocalStorage,
  storageKey: "my-app.e2ee.v1",
  strategies: createStrategyRegistry(createAes256GcmStrategy()),
});

// These credentials usually come from your login form.
await restBackend.loginWithPassword("ops@example.com", "top-secret-password");

const restNotes = restBackend.getClient("notes");

// This input comes from your application UI or another trusted client-side workflow.
await restNotes.create({
  content: "Encrypted text",
  id: crypto.randomUUID(),
  title: "First note",
});
```

### Minimal GraphQL Example

```ts
import {
  type ClientModelDefinition,
  E2eeEncryptionStrategy,
  type E2eeBackend,
  E2eeBackendStorageStrategy,
  type EncryptedFieldValue,
  type EntitySchema,
  type GraphqlPasswordAuthConfig,
  type GraphqlTransport,
  GraphqlCrudAdapter,
  createAes256GcmStrategy,
  createE2eeBackend,
  createGraphqlPasswordAuthConfig,
  createGraphqlTransport,
  createStrategyRegistry,
  defineClientModel,
  defineEntityModel,
  field,
} from "e2ee-client-backend";

// Reuse one transport for both auth and note CRUD operations.
// Point `/graphql` at the endpoint exposed by your app server or API gateway.
const graphqlTransport: GraphqlTransport = createGraphqlTransport(async ({ document, kind, variables }) => {
  const response = await fetch("/graphql", {
    body: JSON.stringify({ query: String(document), variables }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await response.json() as {
    data?: unknown;
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message);
  }

  return payload.data;
});

// This describes the `user` object returned by login, refresh, and registration.
// Copy this shape from your auth API response contract or GraphQL schema.
type SessionUser = {
  email: string;
  id: string;
};

// Keep the auth operations together so it is obvious which backend contract the
// password flow depends on. These documents must match your GraphQL schema.
// Get the field names and arguments from the auth resolvers exposed by your API.
const KDF_SALT = `
  query KdfSalt($email: String!) {
    kdfSalt(email: $email)
  }
`;

const LOGIN = `
  mutation Login($email: String!, $authKeyMaterialHex: String!) {
    login(email: $email, authKeyMaterialHex: $authKeyMaterialHex) {
      ok
      message
      user {
        id
        email
      }
    }
  }
`;

const LOGOUT = `
  mutation Logout {
    logout
  }
`;

const REFRESH = `
  mutation RefreshSession {
    refreshSession {
      ok
      message
      user {
        id
        email
      }
    }
  }
`;

const REGISTER_BEGIN = `
  mutation RegisterBegin($email: String!) {
    registerBegin(email: $email) {
      kdfSaltBase64
    }
  }
`;

const REGISTER_COMPLETE = `
  mutation RegisterComplete($email: String!, $authKeyMaterialHex: String!) {
    registerComplete(email: $email, authKeyMaterialHex: $authKeyMaterialHex) {
      ok
      message
      user {
        id
        email
      }
    }
  }
`;

// This wires the auth documents into the built-in password auth client.
// Use the same transport your app already uses for authenticated GraphQL calls.
const auth: GraphqlPasswordAuthConfig<SessionUser> = createGraphqlPasswordAuthConfig<SessionUser>({
  documents: {
    getKdfSalt: KDF_SALT,
    login: LOGIN,
    logout: LOGOUT,
    refresh: REFRESH,
    registerBegin: REGISTER_BEGIN,
    registerComplete: REGISTER_COMPLETE,
  },
  transport: graphqlTransport,
});

// This describes the note payload returned by your note CRUD operations.
// Copy these fields from your GraphQL type or REST DTO for notes.
type NoteRemoteRecord = {
  content: EncryptedFieldValue;
  id: string;
  title: string;
};

// This model defines which fields are encrypted locally before they are sent.
// The field list comes from your app's domain model, not from the auth API.
const noteModel: EntitySchema<
  { content: string; id: string; title: string },
  NoteRemoteRecord,
  string
> = defineEntityModel({
  cacheCollection: "notes",
  fields: {
    id: field.string(),
    title: field.string(),
    content: field.string().encrypted(),
  },
  idField: "id",
  name: "note",
});

// This CRUD adapter maps repository operations to your note queries and mutations.
// Get these operation names and payload shapes from your GraphQL schema.
const graphqlAdapter: GraphqlCrudAdapter<NoteRemoteRecord, string> = new GraphqlCrudAdapter<NoteRemoteRecord, string>(
  graphqlTransport,
  {
    create: {
      buildVariables: (input) => ({ input }),
      document: `
        mutation CreateNote($input: NoteInput!) {
          createNote(input: $input) {
            id
            title
            content
          }
        }
      `,
      select: (result) => (result as { createNote: NoteRemoteRecord }).createNote,
    },
    delete: {
      buildVariables: (id) => ({ id }),
      document: `
        mutation DeleteNote($id: ID!) {
          deleteNote(id: $id)
        }
      `,
    },
    getById: {
      buildVariables: (id) => ({ id }),
      document: `
        query Note($id: ID!) {
          note(id: $id) {
            id
            title
            content
          }
        }
      `,
      select: (result) => (result as { note: NoteRemoteRecord | null }).note,
    },
    list: {
      document: `
        query Notes {
          notes {
            id
            title
            content
          }
        }
      `,
      select: (result) => (result as { notes: NoteRemoteRecord[] }).notes,
    },
    update: {
      buildVariables: (id, input) => ({ id, input }),
      document: `
        mutation UpdateNote($id: ID!, $input: NoteInput!) {
          updateNote(id: $id, input: $input) {
            id
            title
            content
          }
        }
      `,
      select: (result) => (result as { updateNote: NoteRemoteRecord }).updateNote,
    },
  },
);

// Create one backend so auth, key management, storage, and repositories share state.
// Pick the storage strategy that matches how long the user should stay signed in.
const graphqlBackend: E2eeBackend<
  { notes: ClientModelDefinition<typeof noteModel> },
  SessionUser
> = createE2eeBackend({
  auth,
  defaultStrategyId: E2eeEncryptionStrategy.Aes256Gcm,
  models: {
    notes: defineClientModel({
      adapter: graphqlAdapter,
      schema: noteModel,
    }),
  },
  storage: E2eeBackendStorageStrategy.LocalStorage,
  storageKey: "my-app.e2ee.v1",
  strategies: createStrategyRegistry(createAes256GcmStrategy()),
});

// These credentials usually come from your login form.
await graphqlBackend.loginWithPassword("ops@example.com", "top-secret-password");

const graphqlNotes = graphqlBackend.getClient("notes");

// This input comes from your application UI or another trusted client-side workflow.
await graphqlNotes.create({
  content: "Encrypted text",
  id: crypto.randomUUID(),
  title: "First note",
});
```

### Minimal GraphQL Example With Apollo Client

```ts
import {
  type ClientModelDefinition,
  E2eeEncryptionStrategy,
  type E2eeBackend,
  E2eeBackendStorageStrategy,
  type EncryptedFieldValue,
  type EntitySchema,
  type GraphqlPasswordAuthConfig,
  type GraphqlTransport,
  GraphqlCrudAdapter,
  createAes256GcmStrategy,
  createE2eeBackend,
  createGraphqlPasswordAuthConfig,
  createGraphqlTransport,
  createStrategyRegistry,
  defineClientModel,
  defineEntityModel,
  field,
} from "e2ee-client-backend";

import {
  gql,
  type ApolloClient,
  type NormalizedCacheObject,
} from "@apollo/client";

// This wraps your existing Apollo client in the transport shape expected by the library.
// Use the same Apollo client instance your app already configured with auth headers.
function createApolloGraphqlTransport(
  client: ApolloClient<NormalizedCacheObject>,
) {
  return createGraphqlTransport(async ({ document, kind, variables }) => {
    if (kind === "mutation") {
      const { data } = await client.mutate({
        mutation: document,
        variables,
      });
      return data;
    }

    const { data } = await client.query({
      fetchPolicy: "network-only",
      query: document,
      variables,
    });
    return data;
  });
}

// Provide the Apollo client you already use in the application shell.
declare const apolloClient: ApolloClient<NormalizedCacheObject>;

// Reuse one transport so auth and note CRUD calls share the same Apollo configuration.
const apolloTransport: GraphqlTransport = createApolloGraphqlTransport(apolloClient);

type SessionUser = {
  email: string;
  id: string;
};

// Keep the auth operations together so it is obvious which backend contract the
// password flow depends on. These documents must match your GraphQL schema.
// Get the field names and arguments from the auth resolvers exposed by your API.
const GET_KDF_SALT = gql`
  query KdfSalt($email: String!) {
    kdfSalt(email: $email)
  }
`;

const LOGIN = gql`
  mutation Login($email: String!, $authKeyMaterialHex: String!) {
    login(email: $email, authKeyMaterialHex: $authKeyMaterialHex) {
      ok
      message
      user {
        id
        email
      }
    }
  }
`;

const LOGOUT = gql`
  mutation Logout {
    logout
  }
`;

const REFRESH = gql`
  mutation RefreshSession {
    refreshSession {
      ok
      message
      user {
        id
        email
      }
    }
  }
`;

const REGISTER_BEGIN = gql`
  mutation RegisterBegin($email: String!) {
    registerBegin(email: $email) {
      kdfSaltBase64
    }
  }
`;

const REGISTER_COMPLETE = gql`
  mutation RegisterComplete($email: String!, $authKeyMaterialHex: String!) {
    registerComplete(email: $email, authKeyMaterialHex: $authKeyMaterialHex) {
      ok
      message
      user {
        id
        email
      }
    }
  }
`;

// This wires the auth documents into the built-in password auth client.
// Use the same transport your app already uses for authenticated GraphQL calls.
const auth: GraphqlPasswordAuthConfig<SessionUser> = createGraphqlPasswordAuthConfig<SessionUser>({
  documents: {
    getKdfSalt: GET_KDF_SALT,
    login: LOGIN,
    logout: LOGOUT,
    refresh: REFRESH,
    registerBegin: REGISTER_BEGIN,
    registerComplete: REGISTER_COMPLETE,
  },
  transport: apolloTransport,
});

type NoteRemoteRecord = {
  content: EncryptedFieldValue;
  id: string;
  title: string;
};

const noteModel: EntitySchema<
  { content: string; id: string; title: string },
  NoteRemoteRecord,
  string
> = defineEntityModel({
  cacheCollection: "notes",
  fields: {
    id: field.string(),
    title: field.string(),
    content: field.string().encrypted(),
  },
  idField: "id",
  name: "note",
});

const CREATE_NOTE = gql`
  mutation CreateNote($input: NoteInput!) {
    createNote(input: $input) {
      id
      title
      content
    }
  }
`;

const DELETE_NOTE = gql`
  mutation DeleteNote($id: ID!) {
    deleteNote(id: $id)
  }
`;

const GET_NOTE = gql`
  query Note($id: ID!) {
    note(id: $id) {
      id
      title
      content
    }
  }
`;

const LIST_NOTES = gql`
  query Notes {
    notes {
      id
      title
      content
    }
  }
`;

const UPDATE_NOTE = gql`
  mutation UpdateNote($id: ID!, $input: NoteInput!) {
    updateNote(id: $id, input: $input) {
      id
      title
      content
    }
  }
`;

// This CRUD adapter maps repository operations to your note queries and mutations.
// Get these operation names and payload shapes from your GraphQL schema.
const apolloAdapter: GraphqlCrudAdapter<NoteRemoteRecord, string> = new GraphqlCrudAdapter<NoteRemoteRecord, string>(
  apolloTransport,
  {
    create: {
      buildVariables: (input) => ({ input }),
      document: CREATE_NOTE,
      select: (result) => (result as { createNote: NoteRemoteRecord }).createNote,
    },
    delete: {
      buildVariables: (id) => ({ id }),
      document: DELETE_NOTE,
    },
    getById: {
      buildVariables: (id) => ({ id }),
      document: GET_NOTE,
      select: (result) => (result as { note: NoteRemoteRecord | null }).note,
    },
    list: {
      document: LIST_NOTES,
      select: (result) => (result as { notes: NoteRemoteRecord[] }).notes,
    },
    update: {
      buildVariables: (id, input) => ({ id, input }),
      document: UPDATE_NOTE,
      select: (result) => (result as { updateNote: NoteRemoteRecord }).updateNote,
    },
  },
);

const apolloBackend: E2eeBackend<
  { notes: ClientModelDefinition<typeof noteModel> },
  SessionUser
> = createE2eeBackend({
  auth,
  defaultStrategyId: E2eeEncryptionStrategy.Aes256Gcm,
  models: {
    notes: defineClientModel({
      adapter: apolloAdapter,
      schema: noteModel,
    }),
  },
  storage: E2eeBackendStorageStrategy.LocalStorage,
  storageKey: "my-app.e2ee.v1",
  strategies: createStrategyRegistry(createAes256GcmStrategy()),
});

await apolloBackend.loginWithPassword("ops@example.com", "top-secret-password");

const apolloNotes = apolloBackend.getClient("notes");

await apolloNotes.create({
  content: "Encrypted text",
  id: crypto.randomUUID(),
  title: "First note",
});
```

The important point is that you never provide a manual `contextResolver`. The backend stores the managed encryption key and injects it automatically when repository operations need to encrypt or decrypt fields.

The built-in `auth` configuration creates the password auth adapter internally. You only provide transport-level auth configuration plus the CRUD adapter for each model.

`defaultStrategyId` applies to every registered model in that backend unless a field or lower-level schema explicitly overrides the strategy.

## Optional Realtime Updates

Realtime is opt-in per model.

If a model defines `realtime`, the repository returned by `getClient(...)` can:

- subscribe to local model change events with `repository.subscribe(...)`
- apply pushed remote records through the normal decryption and cache pipeline
- start or stop its realtime connection through `repository.realtime`

Version 1 expects full pushed remote records for `create` and `update` events, plus explicit `delete` events keyed by id.

```ts
import {
  createGraphqlSubscriptionTransport,
  createRealtimeSource,
  defineClientModel,
} from "e2ee-client-backend";

const noteEvents = createRealtimeSource<NoteRemoteRecord, string>({
  document: NOTE_EVENTS_SUBSCRIPTION,
  selectEvent: (payload) => payload.noteEvent,
  transport: createGraphqlSubscriptionTransport(({ document, sink, variables }) => {
    const subscription = apolloClient.subscribe({
      query: document,
      variables,
    }).subscribe({
      complete: sink.onComplete,
      error: sink.onError,
      next: (result) => sink.onData(result.data),
    });

    return {
      unsubscribe() {
        subscription.unsubscribe();
      },
    };
  }),
});

const backend = createE2eeBackend({
  models: {
    notes: defineClientModel({
      adapter: graphqlAdapter,
      realtime: {
        autoStart: true,
        source: noteEvents,
      },
      schema: noteModel,
    }),
  },
});

const notes = backend.getClient("notes");

const unsubscribe = notes.subscribe((event) => {
  if (event.type === "update") {
    console.log("updated entity", event.entity);
  }
});

notes.realtime?.disconnect();
unsubscribe();
```

If no managed encryption key is available when a pushed event arrives, the repository emits a realtime `error` event and drops that update. The simplest recovery path is to restore auth state and then refetch the affected model.

## Auth Flow

If you provide `auth` configuration, `E2eeBackend` exposes the same high-level auth operations directly:

- `beginRegistration(email)`
- `completeRegistrationWithPassword(email, password, kdfSaltBase64)`
- `registerWithPassword(email, password)`
- `loginWithPassword(email, password)`
- `refreshSession()`
- `logout()`

Successful password-based auth stores the managed password and derived encryption key according to the configured storage strategy.

## Model Registration

You can register models either during creation or later.

Creation-time registration is best when you want strong inference from the initial object literal.

```ts
const backend = createE2eeBackend({
  models: {
    notes: defineClientModel({ adapter, schema: noteModel }),
  },
});
```

Runtime registration is useful when models are assembled in steps.

```ts
const backend = createE2eeBackend();

backend.registerModel(
  "notes",
  defineClientModel({ adapter, schema: noteModel }),
);
```

Use `getClient("notes")` to retrieve the lazily created model client.

## Service Registration

You can also register non-repository services on the same object.

```ts
backend.registerService("externalApis", () => ({
  plandera: createPlanderaExternalApiClient(),
}));

const externalApis = backend.getService("externalApis");
```

This is useful for app-level provider registries, external datasource clients, or other services that should be created from the same root backend object.

## When To Use Lower-Level APIs

Use `E2eeBackend` when you want one object to own the application E2EE workflow.

Drop to lower-level APIs when:

- you want repository construction without managed auth or browser storage
- you want explicit control over `contextResolver`
- you are building a library and do not want a stateful browser-oriented abstraction

In those cases, use `createEntityClient(...)` or `createEntityRepository(...)` directly.