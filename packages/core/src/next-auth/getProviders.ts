import { Pool } from "pg";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";

import { query } from "@nile-auth/query";
import { DbCreds } from "@nile-auth/query/getDbInfo";
import { Logger } from "@nile-auth/logger";

import { ProviderNames } from "../types";

import CredentialProvider from "./providers/CredentialProvider";

type RelyingParty = {
  id: string;
  provider: string;
  created: string;
  updated: string;
  deleted: string;
  client_id: string;
  client_secret: string;
  enabled: string;
};

type Provider = {
  id: string;
  name: ProviderNames;
  auth_type: "SOCIAL" | "SSO";
  created: string;
  updated: string;
  deleted: string;
  enabled: boolean;
  config_url: boolean;
  redirect_url: boolean;
  config: boolean;
  ttl_sec: boolean;
};

const { error, debug } = Logger("[providers]");

export async function getProviders(params: DbCreds) {
  const pool = new Pool(params);

  const enabledProviders: string[] = [];
  let useJwt = false;
  const sql = await query(pool);
  // do some pg here, to get providers
  const [providers, credentials] = await Promise.all([
    await sql`
      SELECT
        *
      FROM
        auth.oidc_providers
    `,
    await sql`
      SELECT
        *
      FROM
        auth.oidc_relying_parties
    `,
  ]);

  if (providers && "rowCount" in providers && providers.rowCount === 0) {
    error("No providers are configured.");
  }

  if (
    providers &&
    "rows" in providers &&
    credentials &&
    "rows" in credentials
  ) {
    const configuredProviders = providers?.rows
      .map((provider: Provider) => {
        if (provider.name === ProviderNames.Credentials) {
          if (provider.enabled) {
            enabledProviders.push("Password auth enabled");
            useJwt = true;
            return CredentialProvider({ pool });
          }
        }
        if (provider.name === ProviderNames.Github) {
          const row = credentials?.rows.find(
            (creds: RelyingParty) => creds.provider === provider.id,
          );

          if (row) {
            enabledProviders.push("Github");
            return GithubProvider({
              clientId: row.client_id,
              clientSecret: row.client_secret,
            });
          }
        }
        if (provider.name === ProviderNames.GoogleBeta) {
          const row = credentials?.rows.find(
            (creds: RelyingParty) => creds.provider === provider.id,
          );

          if (row) {
            enabledProviders.push("Google");
            return GoogleProvider({
              clientId: row.client_id,
              clientSecret: row.client_secret,
              authorization: {
                params: { access_type: "offline", prompt: "consent" },
              },
            });
          }
        }
      })
      .filter(Boolean);
    if (configuredProviders.length === 0) {
      error("No beta providers configured");
    } else {
      debug(`${enabledProviders.join(", ")} enabled for ${params.database}`);
    }
    return [configuredProviders, useJwt];
  }
  return [null, false];
}
