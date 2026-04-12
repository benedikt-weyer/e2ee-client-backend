import { describe, expect, it } from "vitest";
import {
  authKeyMaterialHex,
  deriveClientKeyMaterial,
  kdfSaltFromBase64,
} from "../src/crypto/key-derivation";

describe("key derivation", () => {
  it("derives stable client key material from password and salt", async () => {
    const saltBase64 = Buffer.from("stable-salt-value-1234567890123456").toString(
      "base64",
    );

    const first = await deriveClientKeyMaterial("correct horse battery staple", saltBase64);
    const second = await deriveClientKeyMaterial("correct horse battery staple", saltBase64);

    expect(first.kEnc).toEqual(second.kEnc);
    expect(first.kEnc).toHaveLength(32);
    expect(first.kAuthHex).toBe(second.kAuthHex);
    expect(first.kAuthHex).toHaveLength(64);
    expect(await authKeyMaterialHex("correct horse battery staple", saltBase64)).toBe(
      first.kAuthHex,
    );
    expect(kdfSaltFromBase64(saltBase64)).toHaveLength(34);
  });
});