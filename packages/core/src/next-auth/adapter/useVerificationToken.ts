import { Pool } from "pg";

import { query } from "@nile-auth/query";

export function useVerificationToken(pool: Pool) {
  return async function useVerificationToken({
    identifier,
    token,
  }: {
    identifier: string;
    token: string;
  }) {
    const sql = await query(pool);
    const result = await sql`
      DELETE FROM verification_token
      WHERE
        identifier = ${identifier}
        AND token = ${token}
      RETURNING
        identifier,
        expires_at,
        token
    `;
    if (result && "rows" in result) {
      return result.rowCount !== 0 ? result.rows[0] : null;
    }
  };
}
