import { Pool } from "pg";
import { VerificationToken } from "next-auth/adapters";

import { query } from "@nile-auth/query";

export function createVerificationToken(pool: Pool) {
  return async function (
    verificationToken: VerificationToken,
  ): Promise<VerificationToken> {
    const { identifier, expires, token } = verificationToken;
    const sql = await query(pool);
    await sql`
      INSERT INTO
        verification_token (identifier, expires_at, token)
      VALUES
        (
          ${identifier},
          ${expires},
          ${token}
        )
    `;
    return verificationToken;
  };
}
