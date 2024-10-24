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
import { Creds, Params, PartyResultSet } from "./next-auth/providers/types";

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
  const sql = await query(pool);
  const data = await sql`
    "select * from auth.credentials where user_id = ${params.user.id}",
  `;

  if (data && !("rowCount" in data)) {
    return params.session;
  }

  const creds = data?.rows[0] as Creds;

  if (!creds) {
    return params.session;
  }

  const providerName =
    creds.provider === "google" ? "Google (beta)" : creds.provider;

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
  `;
  const expires = creds.expires_at ? parseInt(creds.expires_at, 10) : 0;
  if (party && "rows" in party) {
    if (expires * 1000 < Date.now()) {
      const partyCast = party as PartyResultSet;
      const params: Params = { party: partyCast, sql, creds };

      if (creds.provider === ProviderNames.GoogleBeta) {
        await handleGoogleRefresh(params);
      } else if (creds.provider === ProviderNames.Github) {
        await handleGithubRefresh(params);
      }
    }
  }
  return params.session;
}

export function buildOptionsFromReq(req: Request, cfg?: AuthOptions) {
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
      debug("JWT CALLBACK");
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
