import { describe, expect, it } from "vitest";
import { buildTotpUri, decryptTotpSecret, encryptTotpSecret, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, verifyTotp } from "@/lib/admin-security";

describe("admin security helpers", () => {
  it("creates valid authenticator setup data", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(buildTotpUri(secret)).toContain("otpauth://totp/");
  });

  it("encrypts authenticator secrets at rest", () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret, "test-session-secret");
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted, "test-session-secret")).toBe(secret);
    expect(() => decryptTotpSecret(encrypted, "different-secret")).toThrow();
  });

  it("creates unique, hashable recovery codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(hashRecoveryCode(codes[0])).toMatch(/^[a-f0-9]{64}$/);
  });

  it("verifies RFC 6238 authenticator codes", () => {
    expect(verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 59_000)).toBe(true);
  });

  it("rejects malformed authenticator codes", () => {
    expect(verifyTotp("INVALID", "12345")).toBe(false);
  });
});
