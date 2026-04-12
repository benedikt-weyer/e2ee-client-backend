# Getting Started

## Installation

Install the package from npm:

```bash
npm install e2ee-client-backend
```

With pnpm:

```bash
pnpm add e2ee-client-backend
```

## Runtime Expectations

The package is designed for browser-first usage.

- Node.js 20 or newer is required for local development and build tooling.
- Browser crypto APIs are expected when encrypting and decrypting records at runtime.
- Plaintext caching is intentionally client-side only.

## Typical Flow

Most integrations follow this order:

1. Define a model with the field builder API.
2. Mark the fields that should be end-to-end encrypted.
3. Build CRUD adapters over GraphQL or REST.
4. Create one `E2eeBackend` instance for the app.
5. Let the backend manage auth, secret persistence, and context injection.
6. Fetch generated model clients from that backend in application code.

## Recommended Default

For most browser applications, start with `E2eeBackend`.

That gives you one object that can own:

- password-based auth flows
- browser storage of the managed secret state
- automatic encryption key injection through the internal `contextResolver`
- lazy model client creation
- optional app-level service registration

Use `createEntityClient(...)` directly only when you want repository construction without the stateful orchestration layer.

## Minimal E2eeBackend Examples

Each example below is self-contained and can be copied independently.

### GraphQL

```ts
import {
  E2eeEncryptionStrategy,
  E2eeBackendStorageStrategy,
  type EncryptedFieldValue,
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

type SessionUser = {
  email: string;
  id: string;
};

type NoteRemoteRecord = {
  content: EncryptedFieldValue;
  id: string;
  title: string;
};

const KDF_SALT = `query KdfSalt($email: String!) { kdfSalt(email: $email) }`;
const LOGIN = `mutation Login($email: String!, $authKeyMaterialHex: String!) { login(email: $email, authKeyMaterialHex: $authKeyMaterialHex) { ok message user { id email } } }`;
const LOGOUT = `mutation Logout { logout }`;
const REFRESH = `mutation RefreshSession { refreshSession { ok message user { id email } } }`;
const REGISTER_BEGIN = `mutation RegisterBegin($email: String!) { registerBegin(email: $email) { kdfSaltBase64 } }`;
const REGISTER_COMPLETE = `mutation RegisterComplete($email: String!, $authKeyMaterialHex: String!) { registerComplete(email: $email, authKeyMaterialHex: $authKeyMaterialHex) { ok message user { id email } } }`;

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

const graphqlTransport = createGraphqlTransport(async ({ document, variables }) => {
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

const auth = createGraphqlPasswordAuthConfig<SessionUser>({
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

const graphqlAdapter = new GraphqlCrudAdapter<NoteRemoteRecord, string>(
  graphqlTransport,
  {
    create: {
      buildVariables: (input) => ({ input }),
      document: `mutation CreateNote($input: NoteInput!) { createNote(input: $input) { id title content } }`,
      select: (result) => (result as { createNote: NoteRemoteRecord }).createNote,
    },
    delete: {
      buildVariables: (id) => ({ id }),
      document: `mutation DeleteNote($id: ID!) { deleteNote(id: $id) }`,
    },
    getById: {
      buildVariables: (id) => ({ id }),
      document: `query Note($id: ID!) { note(id: $id) { id title content } }`,
      select: (result) => (result as { note: NoteRemoteRecord | null }).note,
    },
    list: {
      document: `query Notes { notes { id title content } }`,
      select: (result) => (result as { notes: NoteRemoteRecord[] }).notes,
    },
    update: {
      buildVariables: (id, input) => ({ id, input }),
      document: `mutation UpdateNote($id: ID!, $input: NoteInput!) { updateNote(id: $id, input: $input) { id title content } }`,
      select: (result) => (result as { updateNote: NoteRemoteRecord }).updateNote,
    },
  },
);

const graphqlBackend = createE2eeBackend({
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

await graphqlBackend.loginWithPassword("ops@example.com", "top-secret-password");

const graphqlNotes = graphqlBackend.getClient("notes");

await graphqlNotes.create({
  content: "Encrypted text",
  id: crypto.randomUUID(),
  title: "First note",
});
```

### GraphQL With Apollo Client

```ts
import {
  E2eeEncryptionStrategy,
  E2eeBackendStorageStrategy,
  type EncryptedFieldValue,
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

type SessionUser = {
  email: string;
  id: string;
};

type NoteRemoteRecord = {
  content: EncryptedFieldValue;
  id: string;
  title: string;
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

const auth = createGraphqlPasswordAuthConfig<SessionUser>({
  documents: {
    getKdfSalt: GET_KDF_SALT,
    login: LOGIN,
    logout: LOGOUT,
    refresh: REFRESH,
    registerBegin: REGISTER_BEGIN,
    registerComplete: REGISTER_COMPLETE,
  },
  transport: createApolloGraphqlTransport(apolloClient),
});

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

### REST

```ts
import {
  E2eeEncryptionStrategy,
  E2eeBackendStorageStrategy,
  type EncryptedFieldValue,
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

type SessionUser = {
  email: string;
  id: string;
};

type NoteRemoteRecord = {
  content: EncryptedFieldValue;
  id: string;
  title: string;
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

const restTransport = createFetchRestTransport({
  baseUrl: "/api",
  defaultHeaders: {
    accept: "application/json",
  },
});

const auth = createRestPasswordAuthConfig<SessionUser>({
  transport: restTransport,
});

const restAdapter = new RestCrudAdapter<NoteRemoteRecord, string>(restTransport, {
  create: { path: "/notes" },
  delete: { path: (id) => `/notes/${id}` },
  getById: { path: (id) => `/notes/${id}` },
  list: { path: "/notes" },
  update: { path: (id) => `/notes/${id}` },
});

const restBackend = createE2eeBackend({
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

await restBackend.loginWithPassword("ops@example.com", "top-secret-password");

const restNotes = restBackend.getClient("notes");

await restNotes.create({
  content: "Encrypted text",
  id: crypto.randomUUID(),
  title: "First note",
});
```

This is the intended browser-app entrypoint. You do not provide a manual `contextResolver`; the backend manages the active encryption key and injects it automatically for encrypted repository operations.

The built-in `auth` configuration creates the password auth adapter internally. You provide auth transport configuration plus the GraphQL or REST CRUD adapter for each model.

## What You Get By Default

The `E2eeBackend` path gives you a few things automatically:

- encrypted field handling in one place instead of scattering crypto logic through the app
- runtime validation from the field builder definitions
- configurable secret persistence through local storage, session storage, memory, or a custom store
- a LokiJS-backed plaintext cache unless you override cache behavior
- a clean path to expose either the raw repository client or higher-level services from one root object

If you want the full orchestration API surface, continue to [E2eeBackend](e2ee-backend.md).

If you want to go deeper into field mapping and validation, continue to [Modeling Entities](modeling-entities.md).