import { Pool } from "pg";
import { AdapterUser } from "next-auth/adapters";

import { NileUser, convertUser } from "./converter";
import { formatTime, query } from "@nile-auth/query";

export function createUser(pool: Pool) {
  return async function createUser(
    user: Omit<AdapterUser, "id">,
  ): Promise<AdapterUser> {
    const { name, email, image, emailVerified } = user;
    // it is possible that a user has already been "created", they just used a different provider.
    // Unless they have actually verified their email (which getUserByEmail handles), treat them as a "new" user for that provider, removing the old one
    const sql = query(pool);
    const existing = await sql`
      SELECT
        *
      FROM
        users.users
      WHERE
        email = ${email}
    `;

    if (existing && "rowCount" in existing && existing.rowCount > 0) {
      const result = await sql`
        UPDATE users.users
        SET
          name = ${name ? name : null},
          picture = ${image ? image : null}
        RETURNING
          id,
          name,
          email,
          picture;
      `;

      if (result && "rowCount" in result) {
        return convertUser(
          result.rows[0] as unknown as NileUser,
        ) as AdapterUser;
      }
    } else {
      const result = await sql`
        INSERT INTO
          users.users (
            name,
            email,
            picture,
            email_verified,
            created,
            updated
          )
        VALUES
          (
            ${name ? name : null},
            ${email},
            ${image ? image : null},
            ${emailVerified ? emailVerified : null},
            ${formatTime()},
            ${formatTime()}
          )
        RETURNING
          id,
          name,
          email,
          picture;
      `;
      if (result && "rowCount" in result) {
        return convertUser(
          result.rows[0] as unknown as NileUser,
        ) as AdapterUser;
      }
    }
    return null as unknown as AdapterUser;
  };
}
