import { Pool } from "pg";
import { AdapterUser, AdapterSession } from "next-auth/adapters";

import { convertUser, convertSession, NileSession } from "./converter";
import { query } from "@nile-auth/query";

export function getSessionAndUser(pool: Pool) {
  return async function getSessionAndUser(
    sessionToken: string | undefined,
  ): Promise<{
    session: AdapterSession;
    user: AdapterUser;
  } | null> {
    if (sessionToken === undefined) {
      return null;
    }
    const sql = query(pool);
    const sessions = await sql`
      SELECT
        *
      FROM
        auth.sessions
      WHERE
        session_token = ${sessionToken}
    `;
    if (!sessions || ("rowCount" in sessions && sessions.rowCount === 0)) {
      return null;
    }
    if ("rows" in sessions) {
      const session = convertSession(
        sessions.rows[0] as unknown as NileSession,
      ) as AdapterSession;

      const users = await sql`
        SELECT
          *
        FROM
          users.users
        WHERE
          id = ${session.userId}
      `;
      if (users && "rowCount" in users && users.rowCount === 0) {
        return null;
      }
      if (users && "rows" in users) {
        const user = convertUser(users.rows[0]) as AdapterUser;
        return {
          session,
          user,
        };
      }
    }
    return null;
  };
}
