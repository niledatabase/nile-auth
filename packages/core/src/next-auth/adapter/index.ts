import { Pool } from "pg";
import { Adapter } from "next-auth/adapters";

import { AuthOptions } from "../../types";

import { createVerificationToken } from "./createVerificationToken";
import { createUser } from "./createUser";
import { getUser } from "./getUser";
import { getUserByEmail } from "./getUserByEmail";
import { getUserByAccount } from "./getUserByAccount";
import { useVerificationToken } from "./useVerificationToken";
import { linkAccount } from "./linkAccount";
import { updateUser } from "./updateUser";
import { createSession } from "./createSession";
import { getSessionAndUser } from "./getSessionAndUser";
import { updateSession } from "./updateSession";
import { formatTime, query } from "@nile-auth/query";

export default function NileAdapter(
  options: AuthOptions & { user: string; password: string; port: number },
): Adapter {
  const poolConfig = {
    host: options.host,
    user: options.user,
    port: options.port,
    password: options.password,
    database: options.database,
  };
  const pool = new Pool(poolConfig);
  return {
    createVerificationToken: createVerificationToken(pool),
    useVerificationToken: useVerificationToken(pool),
    createUser: createUser(pool),
    getUser: getUser(pool),
    getUserByEmail: getUserByEmail(pool),
    getUserByAccount: getUserByAccount(pool),
    updateUser: updateUser(pool),
    linkAccount: linkAccount(pool),
    createSession: createSession(pool),
    getSessionAndUser: getSessionAndUser(pool),
    updateSession: updateSession(pool),

    async unlinkAccount(partialAccount: {
      provider: string;
      providerAccountId: string;
    }) {
      const { provider, providerAccountId } = partialAccount;
      const sql = await query(pool);
      await sql`
        DELETE FROM auth.credentials
        WHERE
          provider_account_id = ${providerAccountId}
          AND provider = ${provider}
      `;
    },

    async deleteSession(sessionToken) {
      const sql = await query(pool);
      await sql`
        DELETE FROM auth.sessions
        WHERE
          session_token = ${sessionToken}
      `;
    },

    async deleteUser(userId: string) {
      const sql = await query(pool);
      await sql`
        DELETE FROM auth.credentials
        WHERE
          user_id = ${userId}
      `;
      await sql`
        DELETE FROM auth.sessions
        WHERE
          user_id = ${userId}
      `;
      await sql`
        UPDATE users.users
        SET
          deleted = ${formatTime()}
        WHERE
          id = ${userId}
      `;
    },
  };
}
