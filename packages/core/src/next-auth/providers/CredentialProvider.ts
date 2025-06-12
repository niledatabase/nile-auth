import { query } from "@nile-auth/query";
import { Logger } from "@nile-auth/logger";
import bcrypt from "bcryptjs";
import CredentialProvider from "next-auth/providers/credentials";
import { Pool } from "pg";

import {
  ActionableErrors,
  CredentialRow,
  ProviderMethods,
  ProviderNames,
} from "../../types";

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
      const sql = query(pool);
      const creds = await sql`
        SELECT
          *
        FROM
          auth.credentials
        WHERE
          user_id = ${user.id}
          AND deleted IS NULL
      `;
      const providers:
        | null
        | CredentialRow<{
            hash: string;
            crypt: string;
            email: string;
          }>[] = creds && "rows" in creds ? creds.rows : null;

      const emailCredential = providers?.find(
        (p) => p.method === ProviderMethods.EMAIL_PASSWORD,
      );

      // be sure the email is verified, if configured.
      const ep = await sql`
        SELECT
          *
        FROM
          auth.oidc_providers
        WHERE
          name = ${ProviderNames.Email}
      `;
      const emailProvider = ep && "rows" in ep ? ep.rows[0] : null;
      if (emailProvider) {
        const { forceVerified } = emailProvider.config;
        if (forceVerified && !user.email_verified) {
          throw new Error(ActionableErrors.notVerified);
        }
      }

      const credPayload = emailCredential?.payload;
      // if the user hash is missing, it means they have not enabled the credentials provider
      if (!credPayload?.hash) {
        // look to see if there are SSO providers, need to pass a better error back that user should be
        if (providers && providers.length > 0) {
          warn("user is not verified and attempted login with an SSO account");
          throw new Error(ActionableErrors.notVerified);
        }
        warn(`No password in db for ${user.email}`);
        throw new Error("Login failed.");
      } else {
        // if they have a hash and even 1 provider, they must be verified.
        if (providers && providers.length > 1 && !user.email_verified) {
          throw new Error(ActionableErrors.notVerified);
        }
      }

      // order matters, check for creds first, as this could be  empty
      if (user.email !== credPayload.email) {
        warn(`Bad email for ${user.email}`);
        throw new Error("Login failed.");
      }
      const isValid = await verifyUserPassword(
        credentials?.password,
        credPayload?.hash,
      );

      // there is a case where you have SSO'd, but also want to use username/password.
      // If you try to do that, your email address must be verified. op

      if (!isValid) {
        warn(`Bad password for ${user.email}`);
        throw new Error("Login failed.");
      }

      return { id: user.id, email: user.email };
    },
  });
}

type CredPayload = {
  hash?: string;
  email?: string;
};
type UserByEmail = CredPayload & { id: string; email_verified: Date | null };
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
    return u;
  }
  return null;
}

export async function verifyUserPassword(
  enteredPassword: string,
  storedPasswordHash: string | undefined,
) {
  try {
    if (!storedPasswordHash) {
      return false;
    }
    const isValid = await bcrypt.compare(enteredPassword, storedPasswordHash);
    return isValid;
  } catch (e) {
    if (e instanceof Error) {
      error(e.message, { stack: e.stack });
    }
    return false;
  }
}
