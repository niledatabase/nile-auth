import { Pool } from "pg";
import { AdapterUser } from "next-auth/adapters";

import { convertUser } from "./converter";
import { query } from "../../../../query/src/query";

export function updateUser(pool: Pool) {
  return async function updateUser(
    user: Partial<AdapterUser>,
  ): Promise<AdapterUser> {
    if (!user.id) {
      return null as unknown as AdapterUser;
    }
    const sql = await query(pool);
    const users = await sql`
      SELECT
        *
      FROM
        users.users
      WHERE
        id = ${user.id}
    `;
    if (users && "rows" in users) {
      const oldUser = users.rows[0];

      const newUser = {
        ...oldUser,
        ...user,
      };

      const { id, name, email, image } = newUser;
      const existingUser = await sql`
        UPDATE users.users
        SET
          name = ${name},
          email = ${email},
          picture = ${image}
        WHERE
          id = ${id}
        RETURNING
          name,
          id,
          email,
          picture
      `;
      if (existingUser && "rows" in existingUser) {
        return convertUser(existingUser.rows[0]) as AdapterUser;
      }
    }

    return null as unknown as AdapterUser;
  };
}
