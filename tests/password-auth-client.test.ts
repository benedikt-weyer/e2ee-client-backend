import { describe, expect, it } from "vitest";
import {
  createPasswordAuthClient,
  type PasswordAuthAdapter,
} from "../src/auth/password-auth-client";

describe("password auth client", () => {
  it("logs in with password by fetching salt and deriving auth material", async () => {
    const adapter: PasswordAuthAdapter<{ email: string; id: string }> = {
      async getKdfSalt(email) {
        expect(email).toBe("alice@example.com");
        return Buffer.from("stable-salt-value-1234567890123456").toString("base64");
      },
      async login(email, authKeyMaterialHex) {
        expect(email).toBe("alice@example.com");
        expect(authKeyMaterialHex).toHaveLength(64);
        return {
          ok: true,
          user: {
            email,
            id: "user-1",
          },
        };
      },
      async logout() {},
      async refresh() {
        return { ok: true };
      },
      async registerBegin() {
        return {
          kdfSaltBase64: Buffer.from("stable-salt-value-1234567890123456").toString(
            "base64",
          ),
        };
      },
      async registerComplete(email) {
        return {
          ok: true,
          user: {
            email,
            id: "user-1",
          },
        };
      },
    };

    const client = createPasswordAuthClient(adapter);
    const result = await client.loginWithPassword(
      " Alice@example.com ",
      "correct horse battery staple",
    );

    expect(result.normalizedEmail).toBe("alice@example.com");
    expect(result.kEnc).toHaveLength(32);
    expect(result.result.ok).toBe(true);
    expect(result.result.user?.email).toBe("alice@example.com");
  });
});