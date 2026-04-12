import { bytesToBase64, base64ToBytes, toArrayBuffer } from "../encoding/base64";
import { E2eeEncryptionStrategy, type EncryptionStrategy } from "./types";

export interface Aes256GcmContext {
  additionalData?: Uint8Array;
  key: Uint8Array;
}

export class Aes256GcmStrategy
  implements EncryptionStrategy<Aes256GcmContext, Aes256GcmContext>
{
  public readonly id = E2eeEncryptionStrategy.Aes256Gcm;
  public readonly nonceLength = 12;

  public async encrypt(
    plaintext: Uint8Array,
    context: Aes256GcmContext,
  ) {
    const key = await this.importKey(context.key);
    const nonce = crypto.getRandomValues(new Uint8Array(this.nonceLength));
    const params: AesGcmParams = {
      iv: toArrayBuffer(nonce),
      name: "AES-GCM",
    };

    if (context.additionalData) {
      params.additionalData = toArrayBuffer(context.additionalData);
    }

    const ciphertext = await crypto.subtle.encrypt(
      params,
      key,
      toArrayBuffer(plaintext),
    );

    return {
      version: 1 as const,
      algorithm: this.id,
      ciphertextBase64: bytesToBase64(ciphertext),
      nonceBase64: bytesToBase64(nonce),
    };
  }

  public async decrypt(payload: { ciphertextBase64: string; nonceBase64?: string }, context: Aes256GcmContext) {
    if (!payload.nonceBase64) {
      throw new Error("AES-GCM payload is missing nonceBase64.");
    }

    const key = await this.importKey(context.key);
    const params: AesGcmParams = {
      iv: toArrayBuffer(base64ToBytes(payload.nonceBase64)),
      name: "AES-GCM",
    };

    if (context.additionalData) {
      params.additionalData = toArrayBuffer(context.additionalData);
    }

    const plaintext = await crypto.subtle.decrypt(
      params,
      key,
      toArrayBuffer(base64ToBytes(payload.ciphertextBase64)),
    );

    return new Uint8Array(plaintext);
  }

  private async importKey(keyBytes: Uint8Array): Promise<CryptoKey> {
    if (keyBytes.length !== 32) {
      throw new Error("AES-256-GCM expects a 32-byte key.");
    }

    return crypto.subtle.importKey(
      "raw",
      toArrayBuffer(keyBytes),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    );
  }
}

export function createAes256GcmStrategy(): Aes256GcmStrategy {
  return new Aes256GcmStrategy();
}