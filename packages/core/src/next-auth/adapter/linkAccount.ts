import { Pool } from "pg";
import { AdapterAccount } from "next-auth/adapters";

import { convertAccount } from "./converter";
import { query } from "@nile-auth/query";

export function linkAccount(pool: Pool) {
  return async function linkAccount(
    account: AdapterAccount,
  ): Promise<AdapterAccount | undefined> {
    const payload = JSON.stringify({
      type: account.type,
      access_token: account.access_token,
      expires_at: account.expires_at,
      refresh_token: account.refresh_token,
      id_token: account.id_token,
      scope: account.scope,
      session_state: account.session_state,
      token_type: account.token_type,
    });
    const sql = await query(pool);
    const result = await sql`
      INSERT INTO
        auth.credentials (
          payload,
          provider_account_id,
          provider,
          user_id,
          method
        )
      VALUES
        (
          ${payload},
          ${account.providerAccountId},
          ${account.provider},
          ${account.userId},
          ${"OIDC"}
        )
      RETURNING
        payload,
        provider_account_id,
        provider,
        user_id
    `;

    if (result && "rows" in result) {
      return convertAccount(result.rows[0]);
    }
    return undefined;
  };
}
