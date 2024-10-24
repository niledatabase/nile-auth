import { Pool } from "pg";
import { AdapterAccount } from "next-auth/adapters";

import { convertUser } from "./converter";
import { query } from "@nile-auth/query";

export function getUserByAccount(pool: Pool) {
  return async function getUserByAccount({
    providerAccountId,
    provider,
  }: Pick<AdapterAccount, "providerAccountId" | "provider">) {
    const sql = await query(pool);
    const result = await sql`
      SELECT
        u.*
      FROM
        users.users u
        JOIN auth.credentials c ON c.user_id = u.id
      WHERE
        c.provider = ${provider}
        AND c.provider_account_id = ${providerAccountId}
    `;

    if (result && "rows" in result) {
      return convertUser(result.rows[0]);
    }
    return null;
  };
}
