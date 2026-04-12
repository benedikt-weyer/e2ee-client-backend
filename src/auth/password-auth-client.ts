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

export interface PasswordAuthAttempt<TUser> {
  kAuthHex: string;
  kEnc: Uint8Array;
  normalizedEmail: string;
  result: PasswordAuthResult<TUser>;
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