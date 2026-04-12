import type { GraphqlTransport, RestTransport } from "../adapters/contracts";
import { deriveClientKeyMaterial } from "../crypto/key-derivation";

export interface PasswordAuthResult<TUser> {
  message?: string | null;
  ok: boolean;
  user?: TUser | null;
}

export interface PasswordAuthAdapter<TUser> {
  getKdfSalt(email: string): Promise<string>;
  login(
    email: string,
    authKeyMaterialHex: string,
  ): Promise<PasswordAuthResult<TUser>>;
  logout(): Promise<boolean | void>;
  refresh(): Promise<PasswordAuthResult<TUser>>;
  registerBegin(email: string): Promise<{ kdfSaltBase64: string }>;
  registerComplete(
    email: string,
    authKeyMaterialHex: string,
  ): Promise<PasswordAuthResult<TUser>>;
}

export interface RestPasswordAuthConfig<TUser> {
  endpoints?: Partial<{
    getKdfSalt: string;
    login: string;
    logout: string;
    refresh: string;
    registerBegin: string;
    registerComplete: string;
  }>;
  protocol: "rest";
  select?: Partial<{
    getKdfSalt: (result: unknown) => string;
    login: (result: unknown) => PasswordAuthResult<TUser>;
    logout: (result: unknown) => boolean | void;
    refresh: (result: unknown) => PasswordAuthResult<TUser>;
    registerBegin: (result: unknown) => { kdfSaltBase64: string };
    registerComplete: (result: unknown) => PasswordAuthResult<TUser>;
  }>;
  transport: RestTransport;
}

export interface GraphqlPasswordAuthConfig<TUser> {
  documents: {
    getKdfSalt: unknown;
    login: unknown;
    logout: unknown;
    refresh: unknown;
    registerBegin: unknown;
    registerComplete: unknown;
  };
  fieldNames?: Partial<{
    getKdfSalt: string;
    login: string;
    logout: string;
    refresh: string;
    registerBegin: string;
    registerComplete: string;
  }>;
  protocol: "graphql";
  select?: Partial<{
    getKdfSalt: (result: unknown) => string;
    login: (result: unknown) => PasswordAuthResult<TUser>;
    logout: (result: unknown) => boolean | void;
    refresh: (result: unknown) => PasswordAuthResult<TUser>;
    registerBegin: (result: unknown) => { kdfSaltBase64: string };
    registerComplete: (result: unknown) => PasswordAuthResult<TUser>;
  }>;
  transport: GraphqlTransport;
}

export type PasswordAuthConfig<TUser> =
  | GraphqlPasswordAuthConfig<TUser>
  | RestPasswordAuthConfig<TUser>;

export interface PasswordAuthAttempt<TUser> {
  kAuthHex: string;
  kEnc: Uint8Array;
  normalizedEmail: string;
  result: PasswordAuthResult<TUser>;
}

const DEFAULT_REST_AUTH_ENDPOINTS = {
  getKdfSalt: "/auth/kdf-salt",
  login: "/auth/login",
  logout: "/auth/logout",
  refresh: "/auth/refresh",
  registerBegin: "/auth/register-begin",
  registerComplete: "/auth/register-complete",
} as const;

const DEFAULT_GRAPHQL_AUTH_FIELDS = {
  getKdfSalt: "kdfSalt",
  login: "login",
  logout: "logout",
  refresh: "refreshSession",
  registerBegin: "registerBegin",
  registerComplete: "registerComplete",
} as const;

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error(`Expected ${label} to be an object.`);
  }

  return value as Record<string, unknown>;
}

function extractField(
  value: unknown,
  fieldName: string,
  operationName: string,
): unknown {
  const objectValue = asObject(value, `${operationName} result`);
  if (!(fieldName in objectValue)) {
    throw new Error(`Expected ${operationName} result to include "${fieldName}".`);
  }

  return objectValue[fieldName];
}

function parseKdfSalt(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const objectValue = asObject(value, "KDF salt response");
  const kdfSaltBase64 = objectValue.kdfSaltBase64;
  if (typeof kdfSaltBase64 === "string") {
    return kdfSaltBase64;
  }

  const kdfSalt = objectValue.kdfSalt;
  if (typeof kdfSalt === "string") {
    return kdfSalt;
  }

  throw new Error(
    'Expected KDF salt response to be a string or include "kdfSaltBase64".',
  );
}

function parseRegisterBeginResponse(value: unknown): { kdfSaltBase64: string } {
  if (typeof value === "string") {
    return { kdfSaltBase64: value };
  }

  const objectValue = asObject(value, "registerBegin response");
  const kdfSaltBase64 = objectValue.kdfSaltBase64;
  if (typeof kdfSaltBase64 !== "string") {
    throw new TypeError('Expected registerBegin response to include "kdfSaltBase64".');
  }

  return { kdfSaltBase64 };
}

function parsePasswordAuthResult<TUser>(
  value: unknown,
  operationName: string,
): PasswordAuthResult<TUser> {
  const objectValue = asObject(value, `${operationName} response`);
  if (typeof objectValue.ok !== "boolean") {
    throw new TypeError(`Expected ${operationName} response to include boolean "ok".`);
  }

  return objectValue as unknown as PasswordAuthResult<TUser>;
}

function parseLogoutResult(value: unknown): boolean | void {
  if (typeof value === "boolean" || value === undefined || value === null) {
    return value ?? undefined;
  }

  const objectValue = asObject(value, "logout response");
  if (typeof objectValue.ok === "boolean") {
    return objectValue.ok;
  }

  return undefined;
}

export function createRestPasswordAuthConfig<TUser = unknown>(
  options: Omit<RestPasswordAuthConfig<TUser>, "protocol">,
): RestPasswordAuthConfig<TUser> {
  return {
    ...options,
    protocol: "rest",
  };
}

export function createGraphqlPasswordAuthConfig<TUser = unknown>(
  options: Omit<GraphqlPasswordAuthConfig<TUser>, "protocol">,
): GraphqlPasswordAuthConfig<TUser> {
  return {
    ...options,
    protocol: "graphql",
  };
}

export function createPasswordAuthAdapterFromConfig<TUser>(
  config: PasswordAuthConfig<TUser>,
): PasswordAuthAdapter<TUser> {
  if (config.protocol === "rest") {
    const endpoints = {
      ...DEFAULT_REST_AUTH_ENDPOINTS,
      ...config.endpoints,
    };

    return {
      async getKdfSalt(email) {
        const result = await config.transport.request<unknown>({
          method: "GET",
          path: endpoints.getKdfSalt,
          query: { email },
        });
        return config.select?.getKdfSalt
          ? config.select.getKdfSalt(result)
          : parseKdfSalt(result);
      },
      async login(email, authKeyMaterialHex) {
        const result = await config.transport.request<unknown>({
          method: "POST",
          path: endpoints.login,
          body: { authKeyMaterialHex, email },
        });
        return config.select?.login
          ? config.select.login(result)
          : parsePasswordAuthResult<TUser>(result, "login");
      },
      async logout() {
        const result = await config.transport.request<unknown>({
          method: "POST",
          path: endpoints.logout,
        });
        return config.select?.logout
          ? config.select.logout(result)
          : parseLogoutResult(result);
      },
      async refresh() {
        const result = await config.transport.request<unknown>({
          method: "POST",
          path: endpoints.refresh,
        });
        return config.select?.refresh
          ? config.select.refresh(result)
          : parsePasswordAuthResult<TUser>(result, "refresh");
      },
      async registerBegin(email) {
        const result = await config.transport.request<unknown>({
          method: "POST",
          path: endpoints.registerBegin,
          body: { email },
        });
        return config.select?.registerBegin
          ? config.select.registerBegin(result)
          : parseRegisterBeginResponse(result);
      },
      async registerComplete(email, authKeyMaterialHex) {
        const result = await config.transport.request<unknown>({
          method: "POST",
          path: endpoints.registerComplete,
          body: { authKeyMaterialHex, email },
        });
        return config.select?.registerComplete
          ? config.select.registerComplete(result)
          : parsePasswordAuthResult<TUser>(result, "registerComplete");
      },
    };
  }

  const fieldNames = {
    ...DEFAULT_GRAPHQL_AUTH_FIELDS,
    ...config.fieldNames,
  };

  return {
    async getKdfSalt(email) {
      const result = await config.transport.query<unknown>(
        config.documents.getKdfSalt,
        { email },
      );
      const value = extractField(result, fieldNames.getKdfSalt, "getKdfSalt");
      return config.select?.getKdfSalt
        ? config.select.getKdfSalt(value)
        : parseKdfSalt(value);
    },
    async login(email, authKeyMaterialHex) {
      const result = await config.transport.mutate<unknown>(
        config.documents.login,
        { authKeyMaterialHex, email },
      );
      const value = extractField(result, fieldNames.login, "login");
      return config.select?.login
        ? config.select.login(value)
        : parsePasswordAuthResult<TUser>(value, "login");
    },
    async logout() {
      const result = await config.transport.mutate<unknown>(
        config.documents.logout,
      );
      const value = extractField(result, fieldNames.logout, "logout");
      return config.select?.logout
        ? config.select.logout(value)
        : parseLogoutResult(value);
    },
    async refresh() {
      const result = await config.transport.mutate<unknown>(
        config.documents.refresh,
      );
      const value = extractField(result, fieldNames.refresh, "refresh");
      return config.select?.refresh
        ? config.select.refresh(value)
        : parsePasswordAuthResult<TUser>(value, "refresh");
    },
    async registerBegin(email) {
      const result = await config.transport.mutate<unknown>(
        config.documents.registerBegin,
        { email },
      );
      const value = extractField(result, fieldNames.registerBegin, "registerBegin");
      return config.select?.registerBegin
        ? config.select.registerBegin(value)
        : parseRegisterBeginResponse(value);
    },
    async registerComplete(email, authKeyMaterialHex) {
      const result = await config.transport.mutate<unknown>(
        config.documents.registerComplete,
        { authKeyMaterialHex, email },
      );
      const value = extractField(
        result,
        fieldNames.registerComplete,
        "registerComplete",
      );
      return config.select?.registerComplete
        ? config.select.registerComplete(value)
        : parsePasswordAuthResult<TUser>(value, "registerComplete");
    },
  };
}

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class PasswordAuthClient<TUser> {
  public constructor(private readonly adapter: PasswordAuthAdapter<TUser>) {}

  public async beginRegistration(email: string): Promise<string> {
    const response = await this.adapter.registerBegin(normalizeAuthEmail(email));
    return response.kdfSaltBase64;
  }

  public async completeRegistrationWithPassword(
    email: string,
    password: string,
    kdfSaltBase64: string,
  ): Promise<PasswordAuthAttempt<TUser>> {
    const normalizedEmail = normalizeAuthEmail(email);
    const { kAuthHex, kEnc } = await deriveClientKeyMaterial(
      password,
      kdfSaltBase64,
    );
    return {
      kAuthHex,
      kEnc,
      normalizedEmail,
      result: await this.adapter.registerComplete(normalizedEmail, kAuthHex),
    };
  }

  public async loginWithPassword(
    email: string,
    password: string,
  ): Promise<PasswordAuthAttempt<TUser>> {
    const normalizedEmail = normalizeAuthEmail(email);
    const kdfSaltBase64 = await this.adapter.getKdfSalt(normalizedEmail);
    const { kAuthHex, kEnc } = await deriveClientKeyMaterial(
      password,
      kdfSaltBase64,
    );
    return {
      kAuthHex,
      kEnc,
      normalizedEmail,
      result: await this.adapter.login(normalizedEmail, kAuthHex),
    };
  }

  public logout(): Promise<boolean | void> {
    return this.adapter.logout();
  }

  public refreshSession(): Promise<PasswordAuthResult<TUser>> {
    return this.adapter.refresh();
  }

  public async registerWithPassword(
    email: string,
    password: string,
  ): Promise<PasswordAuthAttempt<TUser>> {
    const kdfSaltBase64 = await this.beginRegistration(email);
    return this.completeRegistrationWithPassword(email, password, kdfSaltBase64);
  }
}

export function createPasswordAuthClient<TUser>(
  adapter: PasswordAuthAdapter<TUser>,
): PasswordAuthClient<TUser> {
  return new PasswordAuthClient(adapter);
}