import { createAes256GcmStrategy } from "../crypto/aes-gcm-strategy";
import type { EncryptedFieldValue } from "../crypto/types";
import { bytesToUtf8, utf8ToBytes } from "../encoding/base64";

export interface LegacyEncryptedJsonBlob {
  ciphertextBase64: string;
  nonceBase64: string;
}

const legacyAesStrategy = createAes256GcmStrategy();

export async function decryptJsonFromLegacyBlob<TValue>(
  blob: LegacyEncryptedJsonBlob,
  key: Uint8Array,
): Promise<TValue> {
  const plaintext = await legacyAesStrategy.decrypt(
    legacyBlobToEncryptedField(blob),
    { key },
  );
  return JSON.parse(bytesToUtf8(plaintext)) as TValue;
}

export function encryptedFieldToLegacyBlob(
  payload: EncryptedFieldValue,
): LegacyEncryptedJsonBlob {
  if (!payload.nonceBase64) {
    throw new Error("Legacy blob conversion requires nonceBase64.");
  }

  return {
    ciphertextBase64: payload.ciphertextBase64,
    nonceBase64: payload.nonceBase64,
  };
}

export async function encryptJsonToLegacyBlob<TValue>(
  value: TValue,
  key: Uint8Array,
): Promise<LegacyEncryptedJsonBlob> {
  const payload = await legacyAesStrategy.encrypt(
    utf8ToBytes(JSON.stringify(value)),
    { key },
  );
  return encryptedFieldToLegacyBlob(payload);
}

export function legacyBlobToEncryptedField(
  blob: LegacyEncryptedJsonBlob,
  algorithm = "aes-256-gcm",
): EncryptedFieldValue {
  return {
    algorithm,
    ciphertextBase64: blob.ciphertextBase64,
    nonceBase64: blob.nonceBase64,
    version: 1,
  };
}