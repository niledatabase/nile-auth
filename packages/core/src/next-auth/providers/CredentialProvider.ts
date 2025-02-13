import { query } from "@nile-auth/query";
import { Logger } from "@nile-auth/logger";
import bcrypt from "bcryptjs";
import CredentialProvider from "next-auth/providers/credentials";
import { Pool } from "pg";

const { debug, warn, error } = Logger("[credential provider]");

type Params = {
  pool: Pool;
};
export default function CredProvider({ pool }: Params) {
  return CredentialProvider({
    type: "credentials",
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email) {
        try {
          warn("Email missing from credentials", { credentials });
        } catch (e) {
          error(e, credentials);
        }
        throw new Error("Login failed.");
      }
      debug("authorizing", { email: credentials?.email });
      const user = await getUserByEmail(credentials?.email, pool);

      if (!user || !credentials?.password) {
        throw new Error("Login failed.");
      }

      const isValid = await verifyUserPassword(
        credentials?.password,
        user.hash,
      );

      if (!isValid) {
        throw new Error("Login failed.");
      }

      return { id: user.id, email: user.email };
    },
  });
}

type CredPayload = {
  hash: string;
  email: string;
};
type UserByEmail = CredPayload & { id: string };
export async function getUserByEmail(
  email: string | undefined,
  pool: Pool,
): Promise<null | UserByEmail> {
  if (!email) {
    return null;
  }
  const sql = query(pool);
  const user = await sql`
    SELECT
      *
    FROM
      users.users
    WHERE
      email = ${email}
      AND deleted IS NULL
  `;
  if (user && "rowCount" in user && user.rowCount > 0) {
    const u = user.rows[0];
    const creds = await sql`
      SELECT
        *
      FROM
        auth.credentials
      WHERE
        user_id = ${u.id}
        AND deleted IS NULL
    `;
    if (creds && "rows" in creds) {
      const { payload } = creds.rows[0] as unknown as { payload: CredPayload };
      return { ...payload, id: user.rows[0].id } as UserByEmail;
    }
  }
  return null;
}

export async function verifyUserPassword(
  enteredPassword: string,
  storedPasswordHash: string,
) {
  const isValid = await bcrypt.compare(enteredPassword, storedPasswordHash);
  return isValid;
}
