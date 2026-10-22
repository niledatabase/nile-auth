import { Pool } from "pg";
import { query } from "@nile-auth/query";
import { getSessionKey } from "../jwtSession";

export function deleteSession(pool: Pool) {
  return async function deleteSession(sessionToken: string) {
    const sessionKey = await getSessionKey(sessionToken);
    if (!sessionKey) {
      return;
    }

    const sql = query(pool);
    const result = await sql`
      DELETE FROM auth.sessions
      WHERE
        session_token = ${sessionKey}
    `;
    if (!result || !("rowCount" in result)) {
      throw new Error("Unable to revoke session");
    }
  };
}
