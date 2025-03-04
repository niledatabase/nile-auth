import { DefaultSession, Session } from "next-auth";
import { AdapterUser } from "next-auth/adapters";
import { Pool } from "pg";
import { JWT } from "next-auth/jwt";

import { Logger } from "@nile-auth/logger";
import getDbInfo, { DbCreds } from "../../query/src/getDbInfo";

import Adapter from "./next-auth/adapter";
import { AuthOptions, ProviderNames } from "./types";
import { query } from "@nile-auth/query";
import handleGoogleRefresh from "./next-auth/providers/google";
import handleGithubRefresh from "./next-auth/providers/github";
import { Params, PartyResultSet } from "./next-auth/providers/types";

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
    // Handle the error appropriately here
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

export function buildOptions(cfg?: AuthOptions) {
  const dbInfo = getDbInfo(cfg);
  const config = cfg ? cfg : ({} as AuthOptions);
  config.adapter = Adapter({
    ...config,
    ...dbInfo,
  });
  config.callbacks = {
    jwt: function jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.picture = user.image;
      }
      debug("JWT CALLBACK", { token, user });
      return token;
    },
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
