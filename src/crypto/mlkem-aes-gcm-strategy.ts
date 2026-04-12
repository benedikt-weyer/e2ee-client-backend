import mlkem from "mlkem-wasm";
import { base64ToBytes, bytesToBase64, toArrayBuffer } from "../encoding/base64";
import type { EncryptionStrategy } from "./types";

const ML_KEM_ALGORITHM = { name: "ML-KEM-768" } as const;
const SHARED_KEY_ALGORITHM = { name: "AES-GCM", length: 256 } as const;

export interface MlKemAes256GcmEncryptContext {
  additionalData?: Uint8Array;
  recipientPublicKey: Uint8Array;
}

export interface MlKemAes256GcmDecryptContext {
  additionalData?: Uint8Array;
  recipientPrivateKey: Uint8Array;
}

export interface MlKemKeyPair {
  privateKeySeed: Uint8Array;
  publicKey: Uint8Array;
}

async function importPublicKey(publicKey: Uint8Array): Promise<CryptoKey> {
  return mlkem.importKey(
    "raw-public",
    toArrayBuffer(publicKey),
    ML_KEM_ALGORITHM,
    false,
    ["encapsulateKey"],
  );
}

async function importPrivateKey(privateKeySeed: Uint8Array): Promise<CryptoKey> {
  return mlkem.importKey(
    "raw-seed",
    toArrayBuffer(privateKeySeed),
    ML_KEM_ALGORITHM,
    false,
    ["decapsulateKey"],
  );
}

export async function generateMlKemKeyPair(): Promise<MlKemKeyPair> {
  const { privateKey, publicKey } = await mlkem.generateKey(ML_KEM_ALGORITHM, true, [
    "encapsulateKey",
    "decapsulateKey",
  ]);

  const exportedPublicKey = await mlkem.exportKey("raw-public", publicKey);
  const exportedPrivateKeySeed = await mlkem.exportKey("raw-seed", privateKey);

  return {
    publicKey: new Uint8Array(exportedPublicKey),
    privateKeySeed: new Uint8Array(exportedPrivateKeySeed),
  };
}

export class MlKemAes256GcmStrategy
  implements
    EncryptionStrategy<
      MlKemAes256GcmEncryptContext,
      MlKemAes256GcmDecryptContext
    >
{
  public readonly id = "ml-kem-768-aes-256-gcm";
  public readonly nonceLength = 12;

  public async encrypt(
    plaintext: Uint8Array,
    context: MlKemAes256GcmEncryptContext,
  ) {
    const recipientPublicKey = await importPublicKey(context.recipientPublicKey);
    const encapsulated = await mlkem.encapsulateKey(
      ML_KEM_ALGORITHM,
      recipientPublicKey,
      SHARED_KEY_ALGORITHM,
      false,
      ["encrypt", "decrypt"],
    );
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
      encapsulated.sharedKey,
      toArrayBuffer(plaintext),
    );

    return {
      version: 1 as const,
      algorithm: this.id,
      ciphertextBase64: bytesToBase64(ciphertext),
      nonceBase64: bytesToBase64(nonce),
      encapsulatedKeyCiphertextBase64: bytesToBase64(encapsulated.ciphertext),
      metadata: {
        kem: "ML-KEM-768",
      },
    };
  }

  public async decrypt(
    payload: {
      ciphertextBase64: string;
      encapsulatedKeyCiphertextBase64?: string;
      nonceBase64?: string;
    },
    context: MlKemAes256GcmDecryptContext,
  ): Promise<Uint8Array> {
    if (!payload.nonceBase64) {
      throw new Error("ML-KEM AES payload is missing nonceBase64.");
    }

    if (!payload.encapsulatedKeyCiphertextBase64) {
      throw new Error(
        "ML-KEM AES payload is missing encapsulatedKeyCiphertextBase64.",
      );
    }

    const recipientPrivateKey = await importPrivateKey(context.recipientPrivateKey);
    const sharedKey = await mlkem.decapsulateKey(
      ML_KEM_ALGORITHM,
      recipientPrivateKey,
      toArrayBuffer(base64ToBytes(payload.encapsulatedKeyCiphertextBase64)),
      SHARED_KEY_ALGORITHM,
      false,
      ["decrypt"],
    );
    const params: AesGcmParams = {
      iv: toArrayBuffer(base64ToBytes(payload.nonceBase64)),
      name: "AES-GCM",
    };

    if (context.additionalData) {
      params.additionalData = toArrayBuffer(context.additionalData);
    }

    const plaintext = await crypto.subtle.decrypt(
      params,
      sharedKey,
      toArrayBuffer(base64ToBytes(payload.ciphertextBase64)),
    );

    return new Uint8Array(plaintext);
  }
}

export function createMlKemAes256GcmStrategy(): MlKemAes256GcmStrategy {
  return new MlKemAes256GcmStrategy();
}