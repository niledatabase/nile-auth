import bcrypt from "bcryptjs";

import { ProviderMethods } from "../types";
import { randomString } from "../utils";
import { encryptAuthenticatorSecret } from "./authenticatorSecret";
import { DEFAULT_ISSUER } from "./constants";
import { SqlClient } from "./types";

export type StoredRecoveryCode = {
  crypt?: string | null;
  hash?: string | null;
};

export function normalizeRecoveryCode(raw: string): string {
  if (typeof raw !== "string") {
    return "";
  }
  const stripped = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (stripped.length === 0) {
    return "";
  }
  const groups = stripped.match(/.{1,4}/g);
  return groups ? groups.join("-") : stripped;
}

export type ConsumeRecoveryCodeResult = {
  consumed: boolean;
  remainingCodes: StoredRecoveryCode[];
};

export async function consumeRecoveryCode(params: {
  code: string;
  recoveryCodes?: StoredRecoveryCode[] | null | undefined;
}): Promise<ConsumeRecoveryCodeResult> {
  const { code, recoveryCodes } = params;
  if (
    typeof code !== "string" ||
    code.trim().length === 0 ||
    !Array.isArray(recoveryCodes) ||
    recoveryCodes.length === 0
  ) {
    return { consumed: false, remainingCodes: recoveryCodes ?? [] };
  }

  const normalized = normalizeRecoveryCode(code);
  if (normalized.length === 0) {
    return { consumed: false, remainingCodes: recoveryCodes };
  }

  const remaining: StoredRecoveryCode[] = [];
  let consumed = false;

  for (const entry of recoveryCodes) {
    const hash =
      entry && typeof entry.hash === "string" ? entry.hash.trim() : "";
    if (!hash || consumed) {
      remaining.push(entry);
      continue;
    }

    try {
      const matches = await bcrypt.compare(normalized, hash);
      if (matches) {
        consumed = true;
        continue;
      }
    } catch {
      // Ignore malformed hashes and continue with remaining codes.
    }

    remaining.push(entry);
  }

  return {
    consumed,
    remainingCodes: consumed ? remaining : recoveryCodes,
  };
}

export async function storeAuthenticatorSecret(params: {
  sql: SqlClient;
  userId: string;
  secret: string;
  email?: string | null;
  issuer?: string | null;
}): Promise<string[]> {
  const { sql, userId, secret, issuer } = params;
  const issuerName =
    (issuer && issuer.trim().length > 0 ? issuer : undefined) ?? DEFAULT_ISSUER;

  const recoveryKeys = generateRecoveryKeys();
  const encryptedSecret = encryptAuthenticatorSecret(secret);

  await sql`
    DELETE FROM auth.credentials
    WHERE
      user_id = ${userId}
      AND method = ${ProviderMethods.MFA}
  `;

  await sql`
    INSERT INTO
      auth.credentials (user_id, method, payload)
    VALUES
      (
        ${userId},
        ${ProviderMethods.MFA},
        jsonb_build_object(
          'secret_encrypted',
          ${encryptedSecret}::text,
          'issuer',
          ${issuerName}::text,
          'recovery_codes',
          COALESCE(
            (
              SELECT
                jsonb_agg(
                  jsonb_build_object(
                    'crypt',
                    'crypt-bf/8',
                    'hash',
                    public.crypt (code, public.gen_salt ('bf', 8))
                  )
                )
              FROM
                unnest(${recoveryKeys}::TEXT[]) AS codes (code)
            ),
            '[]'::jsonb
          )
        )
      )
  `;

  return recoveryKeys;
}

function generateRecoveryKeys(count = 7): string[] {
  const keys: string[] = [];

  for (let i = 0; i < count; i++) {
    let key: string;
    do {
      key = normalizeRecoveryCode(randomString(10));
    } while (keys.includes(key));

    keys.push(key);
  }

  return keys;
}
