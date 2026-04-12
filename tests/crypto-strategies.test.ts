import { describe, expect, it } from "vitest";
import { createAes256GcmStrategy } from "../src/crypto/aes-gcm-strategy";
import {
  createMlKemAes256GcmStrategy,
  generateMlKemKeyPair,
} from "../src/crypto/mlkem-aes-gcm-strategy";
import { bytesToUtf8, utf8ToBytes } from "../src/encoding/base64";

describe("AES-256-GCM strategy", () => {
  it("round-trips plaintext with a symmetric key", async () => {
    const strategy = createAes256GcmStrategy();
    const key = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1));
    const payload = await strategy.encrypt(utf8ToBytes("hello e2ee backend"), { key });
    const decrypted = await strategy.decrypt(payload, { key });

    expect(bytesToUtf8(decrypted)).toBe("hello e2ee backend");
  });
});

describe("ML-KEM-768 + AES-256-GCM strategy", () => {
  it("round-trips plaintext with a WASM-backed post-quantum envelope", async () => {
    const strategy = createMlKemAes256GcmStrategy();
    const keyPair = await generateMlKemKeyPair();

    const payload = await strategy.encrypt(utf8ToBytes("post-quantum payload"), {
      recipientPublicKey: keyPair.publicKey,
    });
    const decrypted = await strategy.decrypt(payload, {
      recipientPrivateKey: keyPair.privateKeySeed,
    });

    expect(bytesToUtf8(decrypted)).toBe("post-quantum payload");
  });
});