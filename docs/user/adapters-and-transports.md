# Adapters and Transports

## Layering

The package keeps protocol code separate from entity and crypto logic.

The general flow is:

1. a transport knows how to talk to a backend protocol
2. a CRUD adapter translates repository operations into transport calls
3. the repository or client factory uses that adapter to persist models

## GraphQL

Use the GraphQL helpers when your backend already exposes mutations and queries.

- `createGraphqlTransport` wraps an executor function
- `GraphqlCrudAdapter` maps repository CRUD operations onto GraphQL documents

This keeps model logic independent from GraphQL document execution details.

## REST

Use the REST helpers when your backend is route-oriented.

- `createFetchRestTransport` builds a transport on top of `fetch`
- `RestCrudAdapter` maps CRUD operations onto HTTP routes

This is the right fit when endpoints already exist and you want the encrypted entity layer to stay protocol-agnostic.

## Realtime

Request-response transports stay unchanged.

Realtime support is opt-in and uses a separate subscription companion layer:

- `createWebSocketSubscriptionTransport(...)` for generic WebSocket event streams
- `createGraphqlSubscriptionTransport(...)` for GraphQL subscriptions
- `createRealtimeSource(...)` to map transport payloads into normalized model events

The normalized event shape is intentionally small:

- `create` with a full remote record payload
- `update` with a full remote record payload
- `delete` with an entity id

Version 1 expects full remote replacements instead of partial patches. That keeps pushed data on the same validation and decryption path as normal reads.

### Generic WebSocket Pattern

```ts
import {
	createRealtimeSource,
	createWebSocketSubscriptionTransport,
} from "e2ee-client-backend";

const websocketTransport = createWebSocketSubscriptionTransport({
	url: "wss://api.example.com/realtime",
});

const notesRealtime = createRealtimeSource({
	document: "notes",
	selectEvent: (payload) => payload as
		| { record: NoteRemoteRecord; type: "create" | "update" }
		| { id: string; type: "delete" },
	transport: websocketTransport,
	variables: { dashboardId: "dashboard-1" },
});
```

The WebSocket protocol is JSON-based. The client sends `subscribe` and `unsubscribe` messages and expects `next`, `error`, and `complete` messages back for a subscription id.

### GraphQL Subscription Pattern

```ts
import {
	createGraphqlSubscriptionTransport,
	createRealtimeSource,
} from "e2ee-client-backend";

const subscriptionTransport = createGraphqlSubscriptionTransport(
	({ document, sink, variables }) => {
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
	},
);

const notesRealtime = createRealtimeSource({
	document: NOTES_UPDATED_SUBSCRIPTION,
	selectEvent: (payload) => payload.noteEvent,
	transport: subscriptionTransport,
});
```

Use GraphQL subscriptions when your GraphQL client and server already support them. Use the generic WebSocket transport when your backend is REST-first or when you want a custom event protocol.

## Adapter Design Guidance

Keep adapters focused on remote I/O.

Adapters should not:

- know about encryption internals
- derive crypto keys
- contain UI-specific transformation logic

Adapters should:

- accept and return remote record shapes
- expose clear `create`, `getById`, `list`, `update`, and `delete` semantics
- stay small enough that protocol changes do not leak into the rest of the app

## Caching Behavior

The repository handles the decrypted client-side cache. Adapters should behave as if every request is authoritative remote I/O.

That separation matters because:

- cache policy stays consistent across GraphQL and REST
- encryption stays in one layer
- transport code remains easier to test in isolation

## External Datasource Note

The transport helpers are also useful for third-party datasource providers.

If you want to call an external API with already-decrypted integration config, do not force it through `createEntityClient(...)`. Build an `ExternalE2eeApiProvider` and wrap it with `createExternalE2eeApiClient(...)` instead. See [External Datasources](external-datasources.md) for the minimal pattern.