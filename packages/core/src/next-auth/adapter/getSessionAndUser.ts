import { Pool } from "pg";
import { AdapterUser, AdapterSession } from "next-auth/adapters";
import { decode } from "next-auth/jwt";

import { convertUser, convertSession, NileSession } from "./converter";
import { query } from "@nile-auth/query";
import { getJwtSession } from "../jwtSession";

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
    const sql = await query(pool);

    let parsed;
    try {
      parsed = await decode({
        token: sessionToken,
        secret: String(process.env.NEXTAUTH_SECRET),
      });
    } catch {
      // OAuth and email sign-ins use opaque database session tokens.
    }
    if (parsed) {
      return getJwtSession(pool, parsed);
    }

    const sessions = await sql`
      SELECT
        *
      FROM
        auth.sessions
      WHERE
        session_token = ${sessionToken}
    `;

    if (sessions && "rows" in sessions) {
      const session = convertSession(
        sessions.rows[0] as unknown as NileSession,
      );
      if (!session) {
        return null;
      }

      const users = await sql`
        SELECT
          *
        FROM
          users.users
        WHERE
          id = ${session.userId}
          AND deleted IS NULL
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
