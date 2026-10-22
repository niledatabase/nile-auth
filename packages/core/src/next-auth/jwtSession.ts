import { decode, JWT } from "next-auth/jwt";
import { Pool } from "pg";
import { query } from "@nile-auth/query";
import { convertSession, convertUser } from "./adapter/converter";

export async function getSessionKey(sessionToken: string) {
  try {
    const token = await decode({
      token: sessionToken,
      secret: String(process.env.NEXTAUTH_SECRET),
    });
    if (token) {
      return typeof token.sid === "string" && token.sid ? token.sid : null;
    }
  } catch {
    // OAuth and email sign-ins use opaque database session tokens.
  }
  return sessionToken;
}

export async function getJwtSession(pool: Pool, token: JWT) {
  if (
    typeof token.sid !== "string" ||
    !token.sid ||
    typeof token.id !== "string" ||
    !token.id ||
    typeof token.exp !== "number" ||
    !Number.isFinite(token.exp) ||
    token.exp <= Date.now() / 1000
  ) {
    return null;
  }

  const sql = query(pool);
  const result = await sql`
    SELECT
      s.session_token,
      s.user_id,
      s.expires_at,
      u.id,
      u.email,
      u.name,
      u.picture,
      u.email_verified
    FROM
      auth.sessions s
      JOIN users.users u ON u.id = s.user_id
    WHERE
      s.session_token = ${token.sid}
      AND s.user_id = ${token.id}
      AND s.expires_at > CURRENT_TIMESTAMP
      AND u.deleted IS NULL
  `;
  const row = result && "rows" in result ? result.rows[0] : undefined;
  const session = convertSession(row);
  const user = convertUser(row);
  if (!session || !user) {
    return null;
  }
  return { session, user };
}
