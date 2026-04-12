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

## What It Manages

An `E2eeBackend` instance can manage these concerns together:

- password-based login and registration through a `PasswordAuthAdapter`
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

```ts
import {
  E2eeEncryptionStrategy,
  E2eeBackendStorageStrategy,
  type EncryptedFieldValue,
  type PasswordAuthAdapter,
  GraphqlCrudAdapter,
  RestCrudAdapter,
  createAes256GcmStrategy,
  createE2eeBackend,
  createFetchRestTransport,
  createGraphqlTransport,
  createStrategyRegistry,
  defineClientModel,
  defineEntityModel,
  field,
} from "e2ee-client-backend";

type SessionUser = {
  email: string;
  id: string;
};

type NoteRemoteRecord = {
  content: EncryptedFieldValue;
  id: string;
  title: string;
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

const noteModel = defineEntityModel({
  cacheCollection: "notes",
  fields: {
    id: field.string(),
    title: field.string(),
    content: field.string().encrypted(),
  },
  idField: "id",
  name: "note",
});
```

The auth adapter is the same in both cases. The CRUD adapter changes depending on whether your backend is GraphQL-based or route-based.

### Minimal GraphQL Example

```ts
const graphqlTransport = createGraphqlTransport(async ({ document, kind, variables }) => {
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

const graphqlAdapter = new GraphqlCrudAdapter<NoteRemoteRecord, string>(
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

const graphqlBackend = createE2eeBackend({
  authAdapter,
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

await graphqlBackend.loginWithPassword("ops@example.com", "top-secret-password");

const graphqlNotes = graphqlBackend.getClient("notes");

await graphqlNotes.create({
  content: "Encrypted text",
  id: crypto.randomUUID(),
  title: "First note",
});
```

### Minimal GraphQL Example With Apollo Client

```ts
import {
  gql,
  type ApolloClient,
  type NormalizedCacheObject,
} from "@apollo/client";

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

declare const apolloClient: ApolloClient<NormalizedCacheObject>;

const apolloAdapter = new GraphqlCrudAdapter<NoteRemoteRecord, string>(
  createApolloGraphqlTransport(apolloClient),
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

const apolloBackend = createE2eeBackend({
  authAdapter,
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
```

### Minimal REST Example

```ts
const restTransport = createFetchRestTransport({
  baseUrl: "/api",
  defaultHeaders: {
    accept: "application/json",
  },
});

const restAdapter = new RestCrudAdapter<NoteRemoteRecord, string>(restTransport, {
  create: { path: "/notes" },
  delete: { path: (id) => `/notes/${id}` },
  getById: { path: (id) => `/notes/${id}` },
  list: { path: "/notes" },
  update: { path: (id) => `/notes/${id}` },
});

const restBackend = createE2eeBackend({
  authAdapter,
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

await restBackend.loginWithPassword("ops@example.com", "top-secret-password");

const restNotes = restBackend.getClient("notes");

await restNotes.create({
  content: "Encrypted text",
  id: crypto.randomUUID(),
  title: "First note",
});
```

The important point is that you never provide a manual `contextResolver`. The backend stores the managed encryption key and injects it automatically when repository operations need to encrypt or decrypt fields.

In both examples, `authAdapter` and the CRUD adapter are application code. `authAdapter` connects password auth to your backend, and the GraphQL or REST adapter connects one model's remote CRUD operations to your API.

`defaultStrategyId` applies to every registered model in that backend unless a field or lower-level schema explicitly overrides the strategy.

## Auth Flow

If you provide a `PasswordAuthAdapter`, `E2eeBackend` exposes the same high-level auth operations directly:

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