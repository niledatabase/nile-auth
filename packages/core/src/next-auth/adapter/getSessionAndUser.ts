import { Pool } from "pg";
import { AdapterUser, AdapterSession } from "next-auth/adapters";
import { decode } from "next-auth/jwt";

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

    // try doing jwt first, its maybe faster?
    try {
      const parsed = await decode({
        token: sessionToken,
        secret: String(process.env.NEXTAUTH_SECRET),
      });
      if (
        typeof parsed?.email === "string" &&
        typeof parsed?.id === "string" &&
        typeof parsed.exp === "number"
      ) {
        return {
          user: { id: parsed.id, email: parsed.email, emailVerified: null },
          session: {
            sessionToken,
            userId: parsed.id,
            expires: new Date(parsed.exp * 1000),
          },
        };
      }
    } catch (e) {
      // do nothing, they may have a valid session (non JWT)
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

    if (sessions && "rows" in sessions) {
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
