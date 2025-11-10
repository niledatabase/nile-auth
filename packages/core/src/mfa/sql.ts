import { DbCreds } from "@nile-auth/query/getDbInfo";
import { ProviderNames } from "../types";
import { MfaConfig, MfaIdentifier, MfaUserRow, SqlClient } from "./types";
import { normalizeProviderKey, normalizeConfig } from "./utils";
import { Pool } from "pg";
import { query } from "@nile-auth/query";

export async function fetchMfaUser(
  sql: SqlClient,
  identifier: MfaIdentifier,
): Promise<MfaUserRow | null> {
  const { userId, email } = identifier;
  if (!userId && !email) {
    return null;
  }

  const result = userId
    ? await sql`
        SELECT
          id,
          email,
          name,
          multi_factor
        FROM
          users.users
        WHERE
          id = ${userId}
          AND deleted IS NULL
      `
    : await sql`
        SELECT
          id,
          email,
          name,
          multi_factor
        FROM
          users.users
        WHERE
          email = ${String(email)}
          AND deleted IS NULL
        LIMIT
          1
      `;

  if (!result || !("rows" in result) || result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0] as MfaUserRow;
  return row;
}

export async function fetchProviderConfig(
  sql: SqlClient,
  provider?: string | ProviderNames | null,
): Promise<MfaConfig | null> {
  const providerKey = normalizeProviderKey(provider);
  if (!providerKey) {
    return null;
  }

  const result = await sql`
    SELECT
      config
    FROM
      auth.oidc_providers
    WHERE
      name = ${providerKey}
      AND enabled = TRUE
      AND deleted IS NULL
    LIMIT
      1
  `;

  if (!result || !("rows" in result) || result.rowCount === 0) {
    return null;
  }

  return normalizeConfig(result.rows[0]?.config as Partial<MfaConfig> | null);
}
export async function deleteSessionToken(params: {
  dbInfo?: DbCreds;
  sessionToken?: string | null;
}): Promise<void> {
  const { dbInfo, sessionToken } = params;
  if (!dbInfo || !sessionToken) {
    return;
  }
  const pool = new Pool(dbInfo);
  try {
    const sql = await query(pool);
    await sql`
      DELETE FROM auth.sessions
      WHERE
        session_token = ${sessionToken}
    `;
  } finally {
    await pool.end().catch(() => {});
  }
}
