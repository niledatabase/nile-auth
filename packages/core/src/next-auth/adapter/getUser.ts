import { Pool } from "pg";

import { convertUser } from "./converter";
import { query } from "@nile-auth/query";

export function getUser(pool: Pool) {
  return async function getUser(id: string) {
    const sql = await query(pool);
    const result = await sql`
      SELECT
        *
      FROM
        users.users
      WHERE
        id = ${id}
    `;
    if (result && "rows" in result) {
      return convertUser(result.rows[0]);
    }
    return null;
  };
}
