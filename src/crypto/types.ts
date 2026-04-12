export enum E2eeEncryptionStrategy {
  Aes256Gcm = "aes-256-gcm",
  MlKem768Aes256Gcm = "ml-kem-768-aes-256-gcm",
}

export type EncryptionAlgorithmId = `${E2eeEncryptionStrategy}`;

export type EncryptedFieldMetadata = Record<
  string,
  boolean | number | string | null
>;

export interface EncryptedFieldValue {
  version: 1;
  algorithm: EncryptionAlgorithmId;
  ciphertextBase64: string;
  nonceBase64?: string;
  encapsulatedKeyCiphertextBase64?: string;
  metadata?: EncryptedFieldMetadata;
}

export interface EncryptionStrategy<
  TEncryptContext = unknown,
  TDecryptContext = TEncryptContext,
> {
  readonly id: EncryptionAlgorithmId;
  encrypt(
    plaintext: Uint8Array,
    context: TEncryptContext,
  ): Promise<EncryptedFieldValue>;
  decrypt(
    payload: EncryptedFieldValue,
    context: TDecryptContext,
  ): Promise<Uint8Array>;
}

export function isEncryptedFieldValue(value: unknown): value is EncryptedFieldValue {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<EncryptedFieldValue>;
  return (
    candidate.version === 1 &&
    typeof candidate.algorithm === "string" &&
    typeof candidate.ciphertextBase64 === "string"
  );
}