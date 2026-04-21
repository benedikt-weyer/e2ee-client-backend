import type {
  SubscriptionHandle,
  SubscriptionSink,
  SubscriptionTransport,
} from "./contracts";

type MessageListener = (event: { data: string }) => void;
type VoidListener = () => void;
type ErrorListener = (event: unknown) => void;

export interface WebSocketLike {
  addEventListener(type: "close", listener: VoidListener): void;
  addEventListener(type: "error", listener: ErrorListener): void;
  addEventListener(type: "message", listener: MessageListener): void;
  addEventListener(type: "open", listener: VoidListener): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  removeEventListener(type: "close", listener: VoidListener): void;
  removeEventListener(type: "error", listener: ErrorListener): void;
  removeEventListener(type: "message", listener: MessageListener): void;
  removeEventListener(type: "open", listener: VoidListener): void;
  send(data: string): void;
}

export interface WebSocketSubscriptionTransportOptions {
  createSocket?: (url: string, protocols?: string | string[]) => WebSocketLike;
  deserialize?: (data: string) => unknown;
  protocols?: string | string[];
  serialize?: (value: unknown) => string;
  url: string;
}

export type WebSocketSubscriptionOutgoingMessage =
  | {
      document: unknown;
      id: string;
      type: "subscribe";
      variables?: unknown;
    }
  | {
      id: string;
      type: "unsubscribe";
    };

export type WebSocketSubscriptionIncomingMessage =
  | {
      id: string;
      payload: unknown;
      type: "next";
    }
  | {
      error: unknown;
      id: string;
      type: "error";
    }
  | {
      id: string;
      type: "complete";
    };

type ActiveSubscription = {
  sink: SubscriptionSink<unknown>;
};

const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;

function defaultCreateSocket(
  url: string,
  protocols?: string | string[],
): WebSocketLike {
  return new WebSocket(url, protocols) as unknown as WebSocketLike;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === "string") {
    return new Error(value);
  }

  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") {
      return new Error(message);
    }
  }

  return new Error("WebSocket subscription failed.");
}

export class WebSocketSubscriptionTransport implements SubscriptionTransport {
  private readonly activeSubscriptions = new Map<string, ActiveSubscription>();
  private readonly createSocketImpl: (url: string, protocols?: string | string[]) => WebSocketLike;
  private readonly deserialize: (data: string) => unknown;
  private readonly pendingMessages: string[] = [];
  private readonly serialize: (value: unknown) => string;
  private sequence = 0;
  private socket: WebSocketLike | null = null;

  private readonly handleClose = () => {
    const subscriptions = [...this.activeSubscriptions.values()];
    this.cleanupSocket(false);
    for (const subscription of subscriptions) {
      subscription.sink.onError(new Error("WebSocket connection closed."));
    }
  };

  private readonly handleError = (event: unknown) => {
    for (const subscription of this.activeSubscriptions.values()) {
      subscription.sink.onError(toError(event));
    }
  };

  private readonly handleMessage = (event: { data: string }) => {
    const payload = this.deserialize(event.data);
    if (!payload || typeof payload !== "object") {
      return;
    }

    const message = payload as Partial<WebSocketSubscriptionIncomingMessage>;
    if (typeof message.id !== "string" || typeof message.type !== "string") {
      return;
    }

    const subscription = this.activeSubscriptions.get(message.id);
    if (!subscription) {
      return;
    }

    if (message.type === "next") {
      subscription.sink.onData((message as { payload: unknown }).payload);
      return;
    }

    if (message.type === "error") {
      subscription.sink.onError(toError((message as { error: unknown }).error));
      return;
    }

    if (message.type === "complete") {
      this.activeSubscriptions.delete(message.id);
      subscription.sink.onComplete?.();
      this.closeSocketIfIdle();
    }
  };

  private readonly handleOpen = () => {
    if (!this.socket) {
      return;
    }

    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift();
      if (message !== undefined) {
        this.socket.send(message);
      }
    }
  };

  public constructor(private readonly options: WebSocketSubscriptionTransportOptions) {
    this.createSocketImpl = options.createSocket ?? defaultCreateSocket;
    this.deserialize = options.deserialize ?? JSON.parse;
    this.serialize = options.serialize ?? JSON.stringify;
  }

  public subscribe<TResult, TVariables = Record<string, unknown>>(
    document: unknown,
    sink: SubscriptionSink<TResult>,
    variables?: TVariables,
  ): SubscriptionHandle {
    const id = `sub-${++this.sequence}`;
    this.activeSubscriptions.set(id, {
      sink: sink as SubscriptionSink<unknown>,
    });

    this.ensureSocket();
    this.send({
      document,
      id,
      ...(variables === undefined ? {} : { variables }),
      type: "subscribe",
    });

    return {
      unsubscribe: () => {
        if (!this.activeSubscriptions.delete(id)) {
          return;
        }

        this.send({
          id,
          type: "unsubscribe",
        });
        this.closeSocketIfIdle();
      },
    };
  }

  private cleanupSocket(clearSubscriptions: boolean): void {
    if (clearSubscriptions) {
      this.activeSubscriptions.clear();
    }

    if (!this.socket) {
      return;
    }

    this.socket.removeEventListener("close", this.handleClose);
    this.socket.removeEventListener("error", this.handleError);
    this.socket.removeEventListener("message", this.handleMessage);
    this.socket.removeEventListener("open", this.handleOpen);
    this.socket = null;
    this.pendingMessages.length = 0;
  }

  private closeSocketIfIdle(): void {
    if (!this.socket || this.activeSubscriptions.size > 0) {
      return;
    }

    const socket = this.socket;
    this.cleanupSocket(false);
    socket.close();
  }

  private ensureSocket(): void {
    if (this.socket) {
      return;
    }

    const socket = this.createSocketImpl(this.options.url, this.options.protocols);
    socket.addEventListener("close", this.handleClose);
    socket.addEventListener("error", this.handleError);
    socket.addEventListener("message", this.handleMessage);
    socket.addEventListener("open", this.handleOpen);
    this.socket = socket;

    if (socket.readyState === SOCKET_OPEN) {
      this.handleOpen();
    }
  }

  private send(message: WebSocketSubscriptionOutgoingMessage): void {
    const serialized = this.serialize(message);
    if (!this.socket || this.socket.readyState === SOCKET_CONNECTING) {
      this.pendingMessages.push(serialized);
      return;
    }

    this.socket.send(serialized);
  }
}

export function createWebSocketSubscriptionTransport(
  options: WebSocketSubscriptionTransportOptions,
): WebSocketSubscriptionTransport {
  return new WebSocketSubscriptionTransport(options);
}