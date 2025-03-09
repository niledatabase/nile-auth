import { Pool } from "pg";
import { VerificationToken } from "next-auth/adapters";

import { query } from "@nile-auth/query";

export function createVerificationToken(pool: Pool) {
  return async function (
    verificationToken: VerificationToken,
  ): Promise<VerificationToken> {
    const { expires, token, identifier } = verificationToken;
    const sql = await query(pool);

    await sql`
      INSERT INTO
        auth.verification_tokens (identifier, expires, token)
      VALUES
        (
          ${identifier},
          ${expires},
          ${token}
        )
      ON CONFLICT (identifier) DO
      UPDATE
      SET
        token = EXCLUDED.token,
        expires = EXCLUDED.expires
    `;
    return verificationToken;
  };
}
