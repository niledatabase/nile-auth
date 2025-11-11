import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION = 1;
const KEY_ENV_VARS = ["NILE_MFA_ENCRYPTION_KEY", "NEXTAUTH_SECRET"] as const;

type SplitPayload = {
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
};

function resolveKeySource(keyOverride?: string): string {
  const normalized = keyOverride?.trim();
  if (normalized) {
    return normalized;
  }

  for (const envVar of KEY_ENV_VARS) {
    const candidate = process.env[envVar];
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  throw new Error(
    "MFA encryption key is not configured. Set NILE_MFA_ENCRYPTION_KEY or NEXTAUTH_SECRET.",
  );
}

function deriveKey(raw: string): Buffer {
  const hash = createHash("sha256");
  hash.update(raw, "utf8");
  return hash.digest().subarray(0, KEY_LENGTH);
}

function splitPayload(buffer: Buffer): SplitPayload {
  if (buffer.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Authenticator secret payload is malformed.");
  }
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  if (ciphertext.length === 0) {
    throw new Error("Authenticator secret payload is missing ciphertext.");
  }
  return { iv, authTag, ciphertext };
}

function serializePayload(iv: Buffer, authTag: Buffer, ciphertext: Buffer) {
  const payload = Buffer.concat([iv, authTag, ciphertext]);
  return `v${VERSION}:${payload.toString("base64")}`;
}

function deserializePayload(encoded: string): SplitPayload {
  const trimmed = encoded.trim();

  let payloadSection = trimmed;
  if (payloadSection.startsWith("v")) {
    const separator = payloadSection.indexOf(":");
    if (separator === -1) {
      throw new Error("Authenticator secret payload has an invalid version.");
    }
    const versionString = payloadSection.substring(1, separator);
    const version = Number.parseInt(versionString, 10);
    if (!Number.isInteger(version) || version <= 0) {
      throw new Error("Authenticator secret payload version is unsupported.");
    }
    if (version !== VERSION) {
      throw new Error("Authenticator secret payload version is unsupported.");
    }
    payloadSection = payloadSection.substring(separator + 1);
  }

  if (payloadSection.length === 0) {
    throw new Error("Authenticator secret payload is empty.");
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(payloadSection, "base64");
  } catch (error) {
    throw new Error("Authenticator secret payload is not valid base64.");
  }

  if (buffer.length === 0) {
    throw new Error("Authenticator secret payload is malformed.");
  }

  return splitPayload(buffer);
}

function decryptPayload(
  payload: string,
  keyOverride?: string,
): string {
  if (!payload || typeof payload !== "string") {
    throw new Error("Stored authenticator secret is invalid.");
  }

  const rawKey = resolveKeySource(keyOverride);
  const key = deriveKey(rawKey);

  try {
    const { iv, authTag, ciphertext } = deserializePayload(payload);

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } finally {
    key.fill(0);
  }
}

export function encryptAuthenticatorSecret(
  secret: string,
  keyOverride?: string,
): string {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("Authenticator secret must be a non-empty string.");
  }

  const rawKey = resolveKeySource(keyOverride);
  const key = deriveKey(rawKey);

  try {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const ciphertext = Buffer.concat([
      cipher.update(secret, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return serializePayload(iv, authTag, ciphertext);
  } finally {
    key.fill(0);
  }
}

export function decryptAuthenticatorSecret(
  payload: string,
  keyOverride?: string,
): string {
  try {
    return decryptPayload(payload, keyOverride);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown decryption failure";
    throw new Error(`Unable to decrypt authenticator secret: ${message}`);
  }
}
