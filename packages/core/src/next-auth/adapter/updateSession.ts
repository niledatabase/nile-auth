import { Pool } from "pg";
import { AdapterSession } from "next-auth/adapters";

import { convertSession } from "./converter";
import { query } from "@nile-auth/query";
import { getSessionKey } from "../jwtSession";

export function updateSession(pool: Pool) {
  return async function updateSession(
    session: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">,
  ): Promise<AdapterSession | null | undefined> {
    const { sessionToken } = session;
    const sessionKey = await getSessionKey(sessionToken);
    if (!sessionKey) {
      return null;
    }
    const sql = await query(pool);
    const sessions = await sql`
      SELECT
        *
      FROM
        auth.sessions
      WHERE
        session_token = ${sessionKey}
        AND expires_at > CURRENT_TIMESTAMP
    `;

    if (sessions && "rows" in sessions && sessions.rows.length > 0) {
      const originalSession = convertSession(
        sessions.rows[0],
      ) as AdapterSession;

      const newSession: AdapterSession = {
        ...originalSession,
        ...session,
        sessionToken: sessionKey,
      };

      const result = await sql`
        UPDATE auth.sessions
        SET
          expires_at = ${newSession.expires}
        WHERE
          session_token = ${newSession.sessionToken}
          AND expires_at > CURRENT_TIMESTAMP
        RETURNING
          session_token,
          user_id,
          expires_at
      `;

      if (result && "rows" in result) {
        return convertSession(result.rows[0]) as AdapterSession;
      }
    }
  };
}
