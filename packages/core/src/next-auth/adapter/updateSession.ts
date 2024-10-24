import { Pool } from "pg";
import { AdapterSession } from "next-auth/adapters";

import { convertSession } from "./converter";
import { query } from "../../../../query/src/query";

export function updateSession(pool: Pool) {
  return async function updateSession(
    session: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">,
  ): Promise<AdapterSession | null | undefined> {
    const { sessionToken } = session;
    const sql = await query(pool);
    const sessions = await sql`
      SELECT
        *
      FROM
        auth.sessions
      WHERE
        session_token = ${sessionToken}
    `;

    if (sessions && "rows" in sessions) {
      const originalSession = convertSession(
        sessions.rows[0],
      ) as AdapterSession;

      const newSession: AdapterSession = {
        ...originalSession,
        ...session,
      };

      const result = await sql`
        UPDATE auth.sessions
        SET
          expires_at = ${newSession.expires}
        WHERE
          session_token = ${newSession.sessionToken}
      `;

      if (result && "rows" in result) {
        return convertSession(result.rows[0]) as AdapterSession;
      }
    }
  };
}
