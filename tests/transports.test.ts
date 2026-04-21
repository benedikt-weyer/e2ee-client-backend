import { describe, expect, it, vi } from "vitest";
import {
  createGraphqlSubscriptionTransport,
  createGraphqlTransport,
  GraphqlCrudAdapter,
} from "../src/adapters/graphql";
import { createRealtimeSource } from "../src/adapters/realtime";
import { createFetchRestTransport, RestCrudAdapter } from "../src/adapters/rest";
import {
  createWebSocketSubscriptionTransport,
  type WebSocketLike,
} from "../src/adapters/websocket";

class FakeWebSocket implements WebSocketLike {
  private readonly listeners = {
    close: new Set<() => void>(),
    error: new Set<(event: unknown) => void>(),
    message: new Set<(event: { data: string }) => void>(),
    open: new Set<() => void>(),
  };

  public closed = false;
  public readyState = 0;
  public readonly sent: string[] = [];

  public addEventListener(type: "close" | "error" | "message" | "open", listener: any): void {
    this.listeners[type].add(listener);
  }

  public close(): void {
    this.closed = true;
    this.readyState = 3;
    for (const listener of this.listeners.close) {
      listener();
    }
  }

  public emitError(error: unknown): void {
    for (const listener of this.listeners.error) {
      listener(error);
    }
  }

  public emitMessage(message: unknown): void {
    for (const listener of this.listeners.message) {
      listener({ data: JSON.stringify(message) });
    }
  }

  public open(): void {
    this.readyState = 1;
    for (const listener of this.listeners.open) {
      listener();
    }
  }

  public removeEventListener(type: "close" | "error" | "message" | "open", listener: any): void {
    this.listeners[type].delete(listener);
  }

  public send(data: string): void {
    this.sent.push(data);
  }
}

describe("GraphQL transport and adapter", () => {
  it("runs query and mutation operations through the executor", async () => {
    const executor = vi
      .fn()
      .mockImplementation(async ({ kind, variables }) => {
        if (kind === "query") {
          return { dashboards: [{ id: variables?.["id"] ?? "dashboard-1", name: "Main" }] };
        }

        return { updateDashboard: { id: variables?.["id"], name: variables?.["name"] } };
      });
    const transport = createGraphqlTransport(executor);
    const adapter = new GraphqlCrudAdapter(transport, {
      getById: {
        buildVariables: (id: string) => ({ id }),
        document: "DashboardQuery",
        select: (result) => (result as { dashboards: { id: string; name: string }[] }).dashboards[0] ?? null,
      },
      update: {
        buildVariables: (id: string, input: { id: string; name: string }) => ({
          id,
          name: input.name,
        }),
        document: "UpdateDashboardMutation",
        select: (result) => (result as { updateDashboard: { id: string; name: string } }).updateDashboard,
      },
    });

    expect(await adapter.getById("dashboard-7")).toEqual({
      id: "dashboard-7",
      name: "Main",
    });
    expect(
      await adapter.update("dashboard-7", { id: "dashboard-7", name: "Renamed" }),
    ).toEqual({
      id: "dashboard-7",
      name: "Renamed",
    });
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("supports subscription transports and realtime source mapping", () => {
    const unsubscribe = vi.fn();
    const executor = vi.fn().mockImplementation(({ sink }) => {
      sink.onData({ event: { record: { id: "dashboard-1", name: "Main" }, type: "update" } });
      sink.onComplete?.();
      return { unsubscribe };
    });
    const transport = createGraphqlSubscriptionTransport(executor);
    const source = createRealtimeSource<
      { id: string; name: string },
      string,
      { id: string },
      { event: { record: { id: string; name: string }; type: "update" } }
    >({
      document: "DashboardRealtimeSubscription",
      selectEvent: (payload) => payload.event,
      transport,
      variables: { id: "dashboard-1" },
    });
    const onData = vi.fn();
    const onComplete = vi.fn();

    const handle = source.subscribe({
      onComplete,
      onData,
      onError: vi.fn(),
    });

    expect(onData).toHaveBeenCalledWith({
      record: { id: "dashboard-1", name: "Main" },
      type: "update",
    });
    expect(onComplete).toHaveBeenCalled();
    handle.unsubscribe();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe("REST transport and adapter", () => {
  it("builds URLs and JSON requests via fetch", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ id: "integration-1", displayName: "External Tasks" }), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      }),
    );
    const transport = createFetchRestTransport({
      baseUrl: "https://api.example.test/v1",
      fetch: fetchMock,
    });
    const adapter = new RestCrudAdapter(transport, {
      getById: {
        path: (id: string) => `/integrations/${id}`,
      },
      update: {
        path: (id: string) => `/integrations/${id}`,
      },
    });

    expect(await adapter.getById("integration-1")).toEqual({
      id: "integration-1",
      displayName: "External Tasks",
    });
    await adapter.update("integration-1", {
      displayName: "Updated",
      id: "integration-1",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL("integrations/integration-1", "https://api.example.test/v1/"),
      {
        headers: new Headers(),
        method: "GET",
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("integrations/integration-1", "https://api.example.test/v1/"),
      {
        body: JSON.stringify({ displayName: "Updated", id: "integration-1" }),
        headers: new Headers({ "Content-Type": "application/json" }),
        method: "PUT",
      },
    );
  });

  it("routes subscription events through a WebSocket transport", () => {
    const socket = new FakeWebSocket();
    const transport = createWebSocketSubscriptionTransport({
      createSocket: () => socket,
      url: "wss://example.test/realtime",
    });
    const onData = vi.fn();
    const onError = vi.fn();
    const handle = transport.subscribe(
      "notes",
      {
        onData,
        onError,
      },
      { dashboardId: "dashboard-1" },
    );

    expect(socket.sent).toEqual([]);
    socket.open();

    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0])).toEqual({
      document: "notes",
      id: "sub-1",
      type: "subscribe",
      variables: { dashboardId: "dashboard-1" },
    });

    socket.emitMessage({
      id: "sub-1",
      payload: { id: "note-1", type: "update" },
      type: "next",
    });
    expect(onData).toHaveBeenCalledWith({ id: "note-1", type: "update" });

    socket.emitError(new Error("socket failed"));
    expect(onError).toHaveBeenCalled();

    handle.unsubscribe();

    expect(JSON.parse(socket.sent[1])).toEqual({
      id: "sub-1",
      type: "unsubscribe",
    });
    expect(socket.closed).toBe(true);
  });
});