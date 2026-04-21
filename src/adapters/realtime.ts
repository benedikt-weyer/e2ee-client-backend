import type {
  RealtimeSource,
  RemoteRealtimeEvent,
  SubscriptionHandle,
  SubscriptionTransport,
} from "./contracts";

type VariablesFactory<TVariables> =
  | TVariables
  | (() => TVariables | undefined);

function resolveVariables<TVariables>(
  variables?: VariablesFactory<TVariables>,
): TVariables | undefined {
  if (typeof variables === "function") {
    return variables();
  }

  return variables;
}

export interface TransportRealtimeSourceOptions<
  TRemote,
  TId = string,
  TVariables = Record<string, unknown>,
  TPayload = unknown,
> {
  document: unknown;
  selectEvent: (payload: TPayload) => RemoteRealtimeEvent<TRemote, TId>;
  transport: SubscriptionTransport;
  variables?: VariablesFactory<TVariables>;
}

export class TransportRealtimeSource<
  TRemote,
  TId = string,
  TVariables = Record<string, unknown>,
  TPayload = unknown,
> implements RealtimeSource<TRemote, TId>
{
  public constructor(
    private readonly options: TransportRealtimeSourceOptions<
      TRemote,
      TId,
      TVariables,
      TPayload
    >,
  ) {}

  public subscribe(args: {
    onComplete?(): void;
    onData(event: RemoteRealtimeEvent<TRemote, TId>): void;
    onError(error: unknown): void;
  }): SubscriptionHandle {
    return this.options.transport.subscribe<TPayload, TVariables>(
      this.options.document,
      {
        onComplete: args.onComplete,
        onData: (payload) => args.onData(this.options.selectEvent(payload)),
        onError: args.onError,
      },
      resolveVariables(this.options.variables),
    );
  }
}

export function createRealtimeSource<
  TRemote,
  TId = string,
  TVariables = Record<string, unknown>,
  TPayload = unknown,
>(
  options: TransportRealtimeSourceOptions<TRemote, TId, TVariables, TPayload>,
): TransportRealtimeSource<TRemote, TId, TVariables, TPayload> {
  return new TransportRealtimeSource(options);
}