import { Pool } from "pg";
import { AdapterSession } from "next-auth/adapters";

import { NileSession, convertSession } from "./converter";
import { query } from "@nile-auth/query";

export function createSession(pool: Pool) {
  return async function createSession({
    sessionToken,
    userId,
    expires,
  }: AdapterSession) {
    if (userId == null) {
      throw Error("userId is missing from createSession");
    }
    const sql = query(pool);
    const result = await sql`
      INSERT INTO
        auth.sessions (user_id, expires_at, session_token)
      VALUES
        (
          ${userId},
          ${expires},
          ${sessionToken}
        )
      RETURNING
        session_token,
        user_id,
        expires_at
    `;

    if (result && "rows" in result) {
      return convertSession(
        result.rows[0] as unknown as NileSession,
      ) as AdapterSession;
    }
    return convertSession({} as NileSession) as AdapterSession;
  };
}
