import { hkdf } from "@noble/hashes/hkdf.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { base64ToBytes } from "../encoding/base64";

const AUTH_INFO = utf8ToBytes("dashboard.auth.v1");

export const DEFAULT_SCRYPT_PARAMS = {
  N: 1 << 15,
  r: 8,
  p: 1,
  dkLen: 32,
  maxmem: 128 * 1024 * 1024,
} as const;

export function kdfSaltFromBase64(kdfSaltBase64: string): Uint8Array {
  return base64ToBytes(kdfSaltBase64.trim());
}

export async function deriveAes256KeyFromPassword(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  return scryptAsync(utf8ToBytes(password), salt, DEFAULT_SCRYPT_PARAMS);
}

export function deriveAuthKeyMaterial(kEnc: Uint8Array): Uint8Array {
  return hkdf(sha256, kEnc, new Uint8Array(0), AUTH_INFO, 32);
}

export async function deriveClientKeyMaterial(
  password: string,
  kdfSaltBase64: string,
): Promise<{ kAuthHex: string; kEnc: Uint8Array }> {
  const salt = kdfSaltFromBase64(kdfSaltBase64);
  const kEnc = await deriveAes256KeyFromPassword(password, salt);
  return {
    kAuthHex: bytesToHex(deriveAuthKeyMaterial(kEnc)),
    kEnc,
  };
}

export async function authKeyMaterialHex(
  password: string,
  kdfSaltBase64: string,
): Promise<string> {
  const { kAuthHex } = await deriveClientKeyMaterial(password, kdfSaltBase64);
  return kAuthHex;
}