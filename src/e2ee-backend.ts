import {
  createPasswordAuthClient,
  type PasswordAuthAdapter,
  type PasswordAuthAttempt,
  type PasswordAuthResult,
  normalizeAuthEmail,
} from "./auth/password-auth-client";
import {
  createClientModelOutput,
  type ClientModelDefinition,
  type ClientModelsMap,
  type ClientOutput,
  type CreateEntityClientOptions,
} from "./client-factory";
import { createAes256GcmStrategy } from "./crypto/aes-gcm-strategy";
import {
  deriveAes256KeyFromPassword,
  kdfSaltFromBase64,
} from "./crypto/key-derivation";
import {
  createStrategyRegistry,
  type StrategyRegistry,
} from "./crypto/strategy-registry";
import {
  E2eeEncryptionStrategy,
  type EncryptionAlgorithmId,
} from "./crypto/types";
import { base64ToBytes, bytesToBase64 } from "./encoding/base64";
import type { StrategyContextResolver } from "./repositories/entity-repository";

const DEFAULT_STORAGE_KEY = "e2ee-client-backend.v1";

export enum E2eeBackendStorageStrategy {
  Custom = "custom",
  LocalStorage = "local-storage",
  Memory = "memory",
  SessionStorage = "session-storage",
}

export interface E2eeBackendStoredState {
  encryptionKeyBase64: string | null;
  normalizedEmail: string | null;
  password: string | null;
}

export interface E2eeBackendStateStore {
  load(): E2eeBackendStoredState | null;
  save(state: E2eeBackendStoredState | null): void;
}

export interface E2eeBackendSnapshot {
  hasEncryptionKey: boolean;
  hasPassword: boolean;
  hasRestoredState: boolean;
  storageStrategy: E2eeBackendStorageStrategy;
  userEmail: string | null;
}

export type E2eeBackendServiceDefinition<TService> =
  | TService
  | ((backend: E2eeBackend<any, any, any>) => TService);

export interface E2eeBackendOptions<
  TModels extends ClientModelsMap = {},
  TUser = never,
  TServices extends Record<string, any> = {},
> {
  authAdapter?: PasswordAuthAdapter<TUser>;
  cacheFactory?: CreateEntityClientOptions<any>["cacheFactory"];
  contextResolver?: StrategyContextResolver<any, any>;
  defaultStrategyId?: EncryptionAlgorithmId;
  models?: TModels;
  services?: {
    [TKey in keyof TServices]: E2eeBackendServiceDefinition<TServices[TKey]>;
  };
  storage?: E2eeBackendStorageStrategy | E2eeBackendStateStore;
  storageKey?: string;
  strategies?: StrategyRegistry;
}

class MemoryStateStore implements E2eeBackendStateStore {
  private value: E2eeBackendStoredState | null = null;

  public load(): E2eeBackendStoredState | null {
    return this.value ? structuredClone(this.value) : null;
  }

  public save(state: E2eeBackendStoredState | null): void {
    this.value = state ? structuredClone(state) : null;
  }
}

class WebStorageStateStore implements E2eeBackendStateStore {
  public constructor(
    private readonly storage: Storage,
    private readonly storageKey: string,
  ) {}

  public load(): E2eeBackendStoredState | null {
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<E2eeBackendStoredState>;
    if (
      (parsed.encryptionKeyBase64 !== null && typeof parsed.encryptionKeyBase64 !== "string") ||
      (parsed.normalizedEmail !== null && typeof parsed.normalizedEmail !== "string") ||
      (parsed.password !== null && typeof parsed.password !== "string")
    ) {
      return null;
    }

    return {
      encryptionKeyBase64: parsed.encryptionKeyBase64 ?? null,
      normalizedEmail: parsed.normalizedEmail ?? null,
      password: parsed.password ?? null,
    };
  }

  public save(state: E2eeBackendStoredState | null): void {
    if (!state) {
      this.storage.removeItem(this.storageKey);
      return;
    }

    this.storage.setItem(this.storageKey, JSON.stringify(state));
  }
}

function resolveStateStore(args: {
  storage: E2eeBackendOptions<any, any, any>["storage"];
  storageKey: string;
}): {
  stateStore: E2eeBackendStateStore;
  storageStrategy: E2eeBackendStorageStrategy;
} {
  const storage = args.storage ?? E2eeBackendStorageStrategy.LocalStorage;
  if (typeof storage === "object" && storage !== null) {
    return {
      stateStore: storage,
      storageStrategy: E2eeBackendStorageStrategy.Custom,
    };
  }

  if (storage === E2eeBackendStorageStrategy.Memory || typeof window === "undefined") {
    return {
      stateStore: new MemoryStateStore(),
      storageStrategy: storage,
    };
  }

  const webStorage = storage === E2eeBackendStorageStrategy.LocalStorage
    ? window.localStorage
    : window.sessionStorage;

  return {
    stateStore: new WebStorageStateStore(webStorage, args.storageKey),
    storageStrategy: storage,
  };
}

export class E2eeBackend<
  TModels extends ClientModelsMap = {},
  TUser = never,
  TServices extends Record<string, any> = {},
> {
  private readonly authClient;
  private readonly clientOptions: CreateEntityClientOptions<any>;
  private readonly listeners = new Set<(snapshot: E2eeBackendSnapshot) => void>();
  private readonly modelClients = new Map<string, unknown>();
  private readonly modelDefinitions = new Map<string, ClientModelDefinition<any, any>>();
  private readonly defaultStrategyId: EncryptionAlgorithmId;
  private readonly options: E2eeBackendOptions<TModels, TUser, TServices>;
  private readonly serviceDefinitions = new Map<string, E2eeBackendServiceDefinition<any>>();
  private readonly serviceInstances = new Map<string, unknown>();
  private encryptionKey: Uint8Array | null = null;
  private hasRestoredState = false;
  private password: string | null = null;
  private readonly stateStore: E2eeBackendStateStore;
  private readonly storageStrategy: E2eeBackendStorageStrategy;
  private userEmail: string | null = null;

  public readonly contextResolver: StrategyContextResolver<any, any>;
  public readonly strategies: StrategyRegistry;

  public constructor(
    options: E2eeBackendOptions<TModels, TUser, TServices> = {},
  ) {
    this.options = options;
    this.authClient = options.authAdapter
      ? createPasswordAuthClient(options.authAdapter)
      : null;
    const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    const { stateStore, storageStrategy } = resolveStateStore({
      storage: options.storage,
      storageKey,
    });
    this.stateStore = stateStore;
    this.storageStrategy = storageStrategy;
    this.defaultStrategyId = options.defaultStrategyId ?? E2eeEncryptionStrategy.Aes256Gcm;
    this.strategies = options.strategies ?? createStrategyRegistry(createAes256GcmStrategy());
    this.contextResolver = {
      resolve: async (args) => {
        const key = this.getEncryptionKey();
        if (!key) {
          throw new Error(
            "No managed E2EE encryption key is available. Log in, register, or set a password before accessing encrypted fields.",
          );
        }

        const extraContext = this.options.contextResolver
          ? await this.options.contextResolver.resolve(args)
          : undefined;

        return {
          ...(extraContext && typeof extraContext === "object" ? extraContext : {}),
          key,
        };
      },
    };
    this.clientOptions = {
      contextResolver: this.contextResolver,
      models: {} as ClientModelsMap,
      strategies: this.strategies,
    };

    if (options.cacheFactory) {
      this.clientOptions.cacheFactory = options.cacheFactory;
    }

    this.restoreState();

    for (const [key, definition] of Object.entries(options.models ?? {})) {
      this.modelDefinitions.set(key, this.withDefaultStrategy(definition));
    }

    for (const [key, definition] of Object.entries(options.services ?? {})) {
      this.serviceDefinitions.set(key, definition);
    }
  }

  public async beginRegistration(email: string): Promise<string> {
    return this.ensureAuthClient().beginRegistration(email);
  }

  public clearManagedSecret(): void {
    this.encryptionKey = null;
    this.password = null;
    this.userEmail = null;
    this.persistState();
    this.emitChange();
  }

  public async completeRegistrationWithPassword(
    email: string,
    password: string,
    kdfSaltBase64: string,
  ): Promise<PasswordAuthAttempt<TUser>> {
    const attempt = await this.ensureAuthClient().completeRegistrationWithPassword(
      email,
      password,
      kdfSaltBase64,
    );
    if (attempt.result.ok) {
      this.rememberManagedSecret({
        encryptionKey: attempt.kEnc,
        password,
        userEmail: attempt.normalizedEmail,
      });
    }
    return attempt;
  }

  public getClient<TKey extends Extract<keyof TModels, string>>(
    key: TKey,
  ): ClientOutput<TModels>[TKey] {
    const existing = this.modelClients.get(key);
    if (existing) {
      return existing as ClientOutput<TModels>[TKey];
    }

    const definition = this.modelDefinitions.get(key);
    if (!definition) {
      throw new Error(`No client model is registered under "${key}".`);
    }

    const created = createClientModelOutput({
      definition,
      modelKey: key,
      options: this.clientOptions,
    });
    this.modelClients.set(key, created);
    return created as ClientOutput<TModels>[TKey];
  }

  public getClients(): ClientOutput<TModels> {
    const output = {} as ClientOutput<TModels>;

    for (const key of this.modelDefinitions.keys()) {
      output[key as keyof TModels] = this.getClient(
        key as Extract<keyof TModels, string>,
      ) as ClientOutput<TModels>[keyof TModels];
    }

    return output;
  }

  public getEncryptionKey(): Uint8Array | null {
    return this.encryptionKey ? structuredClone(this.encryptionKey) : null;
  }

  public getPassword(): string | null {
    return this.password;
  }

  public getService<TKey extends Extract<keyof TServices, string>>(
    key: TKey,
  ): TServices[TKey] {
    const existing = this.serviceInstances.get(key);
    if (existing) {
      return existing as TServices[TKey];
    }

    const definition = this.serviceDefinitions.get(key);
    if (definition === undefined) {
      throw new Error(`No service is registered under "${key}".`);
    }

    const created = typeof definition === "function"
      ? (definition as (backend: E2eeBackend<any, any, any>) => TServices[TKey])(this)
      : definition;
    this.serviceInstances.set(key, created);
    return created as TServices[TKey];
  }

  public getServices(): TServices {
    const output = {} as TServices;
    for (const key of this.serviceDefinitions.keys()) {
      output[key as keyof TServices] = this.getService(
        key as Extract<keyof TServices, string>,
      );
    }
    return output;
  }

  public getSnapshot(): E2eeBackendSnapshot {
    return {
      hasEncryptionKey: this.encryptionKey !== null,
      hasPassword: this.password !== null,
      hasRestoredState: this.hasRestoredState,
      storageStrategy: this.storageStrategy,
      userEmail: this.userEmail,
    };
  }

  public async loginWithPassword(
    email: string,
    password: string,
  ): Promise<PasswordAuthAttempt<TUser>> {
    const attempt = await this.ensureAuthClient().loginWithPassword(email, password);
    if (attempt.result.ok) {
      this.rememberManagedSecret({
        encryptionKey: attempt.kEnc,
        password,
        userEmail: attempt.normalizedEmail,
      });
    }
    return attempt;
  }

  public async logout(): Promise<boolean | void> {
    const result = await this.ensureAuthClient().logout();
    this.clearManagedSecret();
    return result;
  }

  public registerModel<TKey extends string, TDefinition extends ClientModelDefinition<any, any>>(
    key: TKey,
    definition: TDefinition,
  ): E2eeBackend<TModels & Record<TKey, TDefinition>, TUser, TServices> {
    this.modelDefinitions.set(key, this.withDefaultStrategy(definition));
    this.modelClients.delete(key);
    return this as unknown as E2eeBackend<
      TModels & Record<TKey, TDefinition>,
      TUser,
      TServices
    >;
  }

  public registerService<TKey extends string, TService>(
    key: TKey,
    definition: E2eeBackendServiceDefinition<TService>,
  ): E2eeBackend<TModels, TUser, TServices & Record<TKey, TService>> {
    this.serviceDefinitions.set(key, definition);
    this.serviceInstances.delete(key);
    return this as unknown as E2eeBackend<
      TModels,
      TUser,
      TServices & Record<TKey, TService>
    >;
  }

  public async refreshSession(): Promise<PasswordAuthResult<TUser>> {
    return this.ensureAuthClient().refreshSession();
  }

  public async registerWithPassword(
    email: string,
    password: string,
  ): Promise<PasswordAuthAttempt<TUser>> {
    const attempt = await this.ensureAuthClient().registerWithPassword(email, password);
    if (attempt.result.ok) {
      this.rememberManagedSecret({
        encryptionKey: attempt.kEnc,
        password,
        userEmail: attempt.normalizedEmail,
      });
    }
    return attempt;
  }

  public rememberEncryptionKey(
    encryptionKey: Uint8Array,
    userEmail?: string | null,
  ): void {
    this.rememberManagedSecret({
      encryptionKey,
      password: this.password,
      userEmail: userEmail ?? this.userEmail,
    });
  }

  public async setPassword(args: {
    kdfSaltBase64: string;
    password: string;
    userEmail?: string | null;
  }): Promise<{ encryptionKey: Uint8Array; userEmail: string | null }> {
    const encryptionKey = await deriveAes256KeyFromPassword(
      args.password,
      kdfSaltFromBase64(args.kdfSaltBase64),
    );

    this.rememberManagedSecret({
      encryptionKey,
      password: args.password,
      userEmail: args.userEmail ?? null,
    });

    return {
      encryptionKey,
      userEmail: args.userEmail ? normalizeAuthEmail(args.userEmail) : null,
    };
  }

  public subscribe(
    listener: (snapshot: E2eeBackendSnapshot) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChange(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private ensureAuthClient() {
    if (!this.authClient) {
      throw new Error(
        "This E2eeBackend instance was created without a password auth adapter.",
      );
    }

    return this.authClient;
  }

  private persistState(): void {
    if (!this.encryptionKey && !this.password && !this.userEmail) {
      this.stateStore.save(null);
      return;
    }

    this.stateStore.save({
      encryptionKeyBase64: this.encryptionKey ? bytesToBase64(this.encryptionKey) : null,
      normalizedEmail: this.userEmail,
      password: this.password,
    });
  }

  private rememberManagedSecret(args: {
    encryptionKey: Uint8Array;
    password: string | null;
    userEmail: string | null;
  }): void {
    this.encryptionKey = structuredClone(args.encryptionKey);
    this.password = args.password;
    this.userEmail = args.userEmail ? normalizeAuthEmail(args.userEmail) : null;
    this.persistState();
    this.emitChange();
  }

  private restoreState(): void {
    try {
      const stored = this.stateStore.load();
      if (stored?.encryptionKeyBase64) {
        this.encryptionKey = base64ToBytes(stored.encryptionKeyBase64);
      }
      this.password = stored?.password ?? null;
      this.userEmail = stored?.normalizedEmail
        ? normalizeAuthEmail(stored.normalizedEmail)
        : null;
    } catch {
      this.stateStore.save(null);
      this.encryptionKey = null;
      this.password = null;
      this.userEmail = null;
    } finally {
      this.hasRestoredState = true;
    }
  }

  private withDefaultStrategy<TDefinition extends ClientModelDefinition<any, any>>(
    definition: TDefinition,
  ): TDefinition {
    return {
      ...definition,
      schema: {
        ...definition.schema,
        defaultStrategyId: this.defaultStrategyId,
      },
    } as TDefinition;
  }
}

export function createE2eeBackend<
  TModels extends ClientModelsMap = {},
  TUser = never,
  TServices extends Record<string, any> = {},
>(
  options: E2eeBackendOptions<TModels, TUser, TServices> = {},
): E2eeBackend<TModels, TUser, TServices> {
  return new E2eeBackend(options);
}