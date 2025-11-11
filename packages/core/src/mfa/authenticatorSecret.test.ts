import {
  encryptAuthenticatorSecret,
  decryptAuthenticatorSecret,
} from "./authenticatorSecret";

const ORIGINAL_NILE_KEY = process.env.NILE_MFA_ENCRYPTION_KEY;
const ORIGINAL_NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;

describe("authenticatorSecret", () => {
  beforeEach(() => {
    process.env.NILE_MFA_ENCRYPTION_KEY = "unit-test-key";
    delete process.env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    if (typeof ORIGINAL_NILE_KEY === "string") {
      process.env.NILE_MFA_ENCRYPTION_KEY = ORIGINAL_NILE_KEY;
    } else {
      delete process.env.NILE_MFA_ENCRYPTION_KEY;
    }

    if (typeof ORIGINAL_NEXTAUTH_SECRET === "string") {
      process.env.NEXTAUTH_SECRET = ORIGINAL_NEXTAUTH_SECRET;
    } else {
      delete process.env.NEXTAUTH_SECRET;
    }
  });

  it("round-trips secrets without exposing plaintext", () => {
    const secret = "super-secret-seed";
    const encrypted = encryptAuthenticatorSecret(secret);

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain(secret);

    const decrypted = decryptAuthenticatorSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it("uses NEXTAUTH_SECRET as fallback key", () => {
    delete process.env.NILE_MFA_ENCRYPTION_KEY;
    process.env.NEXTAUTH_SECRET = "fallback-key";

    const secret = "fallback-seed";
    const encrypted = encryptAuthenticatorSecret(secret);
    const decrypted = decryptAuthenticatorSecret(encrypted);

    expect(decrypted).toBe(secret);
  });

  it("rejects tampered payloads", () => {
    const secret = "tamper-proof";
    const encrypted = encryptAuthenticatorSecret(secret);

    const [, encodedPayload] = encrypted.split(":", 2);
    //@ts-expect-error - bad data
    const payloadBuffer = Buffer.from(encodedPayload, "base64");
    //@ts-expect-error - bad data
    payloadBuffer[payloadBuffer.length - 1] ^= 0xff;
    const tampered = `v1:${payloadBuffer.toString("base64")}`;

    expect(() => decryptAuthenticatorSecret(tampered)).toThrow(
      /Unable to decrypt authenticator secret:/i,
    );
  });

  it("rejects payloads with unsupported versions", () => {
    const secret = "version-check";
    const encrypted = encryptAuthenticatorSecret(secret);
    const mutated = encrypted.replace(/^v1:/, "v2:");

    expect(() => decryptAuthenticatorSecret(mutated)).toThrow(
      /Unable to decrypt authenticator secret: Authenticator secret payload version is unsupported\./,
    );
  });

  it("rejects payloads that are not base64", () => {
    expect(() => decryptAuthenticatorSecret("v1:not-base64!!")).toThrow(
      /Unable to decrypt authenticator secret: Authenticator secret payload is malformed\./i,
    );
  });

  it("supports explicit key overrides", () => {
    delete process.env.NILE_MFA_ENCRYPTION_KEY;
    delete process.env.NEXTAUTH_SECRET;

    const secret = "override-secret";
    const encrypted = encryptAuthenticatorSecret(secret, "override-key");
    const decrypted = decryptAuthenticatorSecret(encrypted, "override-key");

    expect(decrypted).toBe(secret);
  });

  it("rejects empty secrets", () => {
    expect(() => encryptAuthenticatorSecret("")).toThrow(
      /must be a non-empty string/i,
    );
  });

  it("throws when no encryption key is configured", () => {
    delete process.env.NILE_MFA_ENCRYPTION_KEY;
    delete process.env.NEXTAUTH_SECRET;

    expect(() => encryptAuthenticatorSecret("missing-key")).toThrow(
      /encryption key is not configured/i,
    );
  });
});
