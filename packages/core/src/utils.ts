import { Account, DefaultSession, Profile, Session, User } from "next-auth";
import { AdapterUser } from "next-auth/adapters";
import { Pool } from "pg";
import { JWT } from "next-auth/jwt";
import { randomUUID } from "crypto";

import { Logger } from "@nile-auth/logger";
import getDbInfo, { DbCreds } from "@nile-auth/query/getDbInfo";

import Adapter from "./next-auth/adapter";
import { AuthOptions, ProviderNames } from "./types";
import { query } from "@nile-auth/query";
import handleGoogleRefresh from "./next-auth/providers/google";
import handleGithubRefresh from "./next-auth/providers/github";
import { Params, PartyResultSet } from "./next-auth/providers/types";
import { ensureMfaChallenge } from "./mfa";
import { buildMfaError, encodeMfaPayload } from "./mfa/utils";
import { maxAge } from "./nextOptions";

const { info, error, debug, warn } = Logger("nile-auth/RouteWrapper");

type RealToken = {
  user: {
    created: string;
    deleted: boolean | null;
    email: string;
    emailVerified: boolean | null;
    familyName: string | null;
    givenName: string | null;
    id: string;
    name: string;
    picture: string;
    updated: string;
  };
  accessToken: string;
  error?: string;
};

async function handleRefreshTokens(
  params: {
    session: Session;
    token: JWT;
    user: AdapterUser;
  } & {
    newSession: unknown;
    trigger: "update";
  },
  dbInfo: DbCreds,
): Promise<Session | DefaultSession> {
  const pool = new Pool(dbInfo);
  pool.on("error", (e: Error) => {
    info("Unexpected error on client", {
      stack: e.stack,
      message: e.message,
    });
  });
  const sql = await query(pool);
  const data = await sql`
    SELECT
      *
    FROM
      auth.credentials
    WHERE
      user_id = ${params.user.id}
  `;

  if (data && !("rowCount" in data)) {
    return params.session;
  }

  const creds = data?.rows[0];

  if (!creds) {
    return params.session;
  }

  const providerName = creds.provider;

  if (!providerName) {
    return params.session;
  }

  const provider = await sql`
    SELECT
      *
    FROM
      auth.oidc_providers
    WHERE
      name = ${providerName}
  `;

  if (provider && !("rowCount" in provider)) {
    return params.session;
  }
  const partyId = provider?.rows[0]?.id;

  if (!partyId) {
    return params.session;
  }
  const party = await sql`
    SELECT
      *
    FROM
      auth.oidc_relying_parties
    WHERE
      provider = ${partyId}
      AND deleted IS NULL
  `;
  const expires = creds.payload.expires_at
    ? parseInt(creds.payload.expires_at, 10)
    : 0;
  if (party && "rows" in party) {
    if (expires * 1000 < Date.now()) {
      const partyCast = party as PartyResultSet;
      const args: Params = {
        user: params.user,
        party: partyCast,
        sql,
        creds: creds.payload,
        provider: provider.rows[0],
      };

      if (creds.provider === ProviderNames.Google) {
        await handleGoogleRefresh(args);
      } else if (creds.provider === ProviderNames.Github) {
        await handleGithubRefresh(args);
      }
    }
  }
  return params.session;
}
export async function jwt(params: {
  token: JWT;
  user: User | AdapterUser;
  account: Account | null;
  profile?: Profile | undefined;
  trigger?: "signIn" | "signUp" | "update";
  isNewUser?: boolean;
  session?: any;
  dbInfo?: DbCreds;
  sessionMaxAge?: number;
}): Promise<JWT> {
  const { user, token } = params;
  if (user) {
    token.id = user.id;
    token.name = user.name;
    token.picture = user.image;
    // NextAuth replaces jti every time it encodes a JWT. Keep our database
    // session key in a separate claim so renewed tokens revoke together.
    token.sid = randomUUID();
  }
  if (
    !params.dbInfo ||
    typeof token.id !== "string" ||
    typeof token.sid !== "string" ||
    !token.sid
  ) {
    throw new Error("JWT session is missing its database session key");
  }
  const exp = Math.floor(Date.now() / 1000) + (params.sessionMaxAge ?? maxAge);
  token.exp = exp;
  const expiresAt = new Date(exp * 1000);
  const pool = new Pool(params.dbInfo);
  try {
    const sql = query(pool);
    const result = user
      ? await sql`
          INSERT INTO
            auth.sessions (user_id, expires_at, session_token)
          VALUES
            (
              ${token.id},
              ${expiresAt},
              ${token.sid}
            )
        `
      : await sql`
          UPDATE auth.sessions
          SET
            expires_at = ${expiresAt}
          WHERE
            session_token = ${token.sid}
            AND user_id = ${token.id}
            AND expires_at > CURRENT_TIMESTAMP
            AND EXISTS (
              SELECT
                1
              FROM
                users.users
              WHERE
                id = ${token.id}
                AND deleted IS NULL
            )
        `;
    if (!result || !("rowCount" in result) || result.rowCount !== 1) {
      throw new Error("JWT session could not be saved or has been revoked");
    }
  } finally {
    await pool.end();
  }
  return token;
}

export function buildOptions(req: Request, cfg?: AuthOptions) {
  const dbInfo = getDbInfo(cfg, req);
  const config = cfg ? cfg : ({} as AuthOptions);
  const adapter = Adapter({
    ...config,
    ...dbInfo,
  });
  config.adapter = adapter;
  config.callbacks = {
    signIn: async function signIn(params) {
      const challenge = await ensureMfaChallenge({
        req,
        dbInfo,
        user: params.user as AdapterUser,
      });
      if (challenge) {
        const encoded = encodeMfaPayload(challenge);
        throw buildMfaError(encoded);
      }
      return true;
    },
    jwt: async (params) =>
      jwt({
        ...params,
        dbInfo,
        sessionMaxAge: config.session?.maxAge,
      }),
    session: async function session(params) {
      const { session, token, user } = params;
      debug("session CALLBACK");
      // when strategy is DB, token is undefined
      const tkn = token as RealToken;
      // need to do have `user` so the Nile JWT in the RouteWrapper response works correctly
      // this is actually pretty brittle, since 'user' may not be in the `jwt` function either
      session.user = user ?? tkn?.user;
      if (tkn?.error) {
        error("ERROR", tkn);
        // is this a thing?
        // session.error = tkn?.error;
      }
      if (tkn) {
        debug("using JWT token");
        return token as unknown as Session;
      }
      if (dbInfo) {
        return handleRefreshTokens(params, dbInfo);
      }
      return { expires: new Date().toISOString() };
    },
  };
  const signOut = config.events?.signOut;
  config.events = {
    ...config.events,
    async signOut(message) {
      if ("token" in message && typeof message.token?.sid === "string") {
        await adapter.deleteSession?.(message.token.sid);
      }
      await signOut?.(message);
    },
  };
  return {
    ...(config ? { ...config, ...dbInfo } : {}),
    debug: true,
    logger: {
      error: (
        code: string,
        meta: Error | { error: Error; [key: string]: unknown },
      ) => {
        if ("error" in meta && meta.error instanceof Error) {
          throw new Error(`[${code}]: ${meta.error.message}`);
        }
        error(code, meta);
      },
      debug: (code: string, meta: { [key: string]: unknown }) => {
        const { url, cookies, provider } = meta;
        if (url || cookies || provider) {
          debug("[next-auth]", { url, cookies, provider });
        }
        let p = "";
        if (provider && typeof provider === "object" && "id" in provider) {
          p = String(provider.id);
        }
        info(`[next-auth]${p ? `[${p}]` : ""} ${code}`, { ...meta });
      },
      warn: (code: string) => {
        warn(code);
      },
    },
  };
}

export function randomString(size: number) {
  const i2hex = (i: number) => ("0" + i.toString(16)).slice(-2);
  const r = (a: string, i: number): string => a + i2hex(i);
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes).reduce(r, "");
}
