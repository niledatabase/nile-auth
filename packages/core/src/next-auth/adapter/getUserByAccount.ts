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
    const [result] = await Promise.all([
      sql`
        SELECT
          u.*
        FROM
          users.users u
          JOIN auth.credentials c ON c.user_id = u.id
          JOIN auth.oidc_providers op ON op.name = c.provider
        WHERE
          c.provider = ${provider}
          AND c.provider_account_id = ${providerAccountId}
          AND op.enabled = TRUE
          AND c.deleted IS NULL
          AND u.deleted IS NULL
          AND op.deleted IS NULL
      `,
    ]);
    if (result && "rows" in result) {
      return convertUser(result.rows[0]);
    }
    return null;
  };
}
