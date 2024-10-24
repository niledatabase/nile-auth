import { Pool } from "pg";

import { convertUser } from "./converter";
import { query } from "@nile-auth/query";

export function getUserByEmail(pool: Pool) {
  return async function getUserByEmail(email: string) {
    const sql = await query(pool);
    const result = await sql`
      SELECT
        *
      FROM
        users.users
      WHERE
        email = ${email}
        AND deleted IS NULL
    `;

    if (result && "rows" in result) {
      return convertUser(result?.rows[0]);
    }
    return null;
  };
}
