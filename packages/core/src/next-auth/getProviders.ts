import { Pool } from "pg";

import AzureProvider from "next-auth/providers/azure-ad";
import CredentialProvider from "./providers/CredentialProvider";
import DiscordProvider from "next-auth/providers/discord";
import EmailProvider from "./providers/email";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import HubspotProvider from "next-auth/providers/hubspot";
import LinkedInProvider, {
  LinkedInProfile,
} from "next-auth/providers/linkedin";
import SlackProvider from "next-auth/providers/slack";
import TwitterProvider from "next-auth/providers/twitter";

import { query } from "@nile-auth/query";
import { DbCreds } from "@nile-auth/query/getDbInfo";
import { Logger } from "@nile-auth/logger";

import { Provider, ProviderNames } from "../types";

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

const { error, debug } = Logger("[providers]");

export async function getProviders(params: DbCreds) {
  const pool = new Pool(params);

  const enabledProviders: string[] = [];
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
        if (!provider.enabled) {
          return;
        }

        enabledProviders.push(provider.name);

        // special providers that need some kind of customization
        switch (provider.name) {
          case ProviderNames.Email:
            return EmailProvider(provider, pool);
          case ProviderNames.Credentials:
            return CredentialProvider({ pool });
        }

        // providers configured with the console
        const row = credentials?.rows.find(
          (creds: RelyingParty) => creds.provider === provider.id,
        );

        if (!row) {
          return;
        }

        switch (provider.name) {
          case ProviderNames.Azure:
            return AzureProvider({
              clientId: row.client_id,
              clientSecret: row.client_secret,
              tenantId: row.config.tenantId,
            });
          case ProviderNames.Discord:
            return DiscordProvider({
              clientId: row.client_id,
              clientSecret: row.client_secret,
            });
          case ProviderNames.Github:
            return GithubProvider({
              clientId: row.client_id,
              clientSecret: row.client_secret,
            });
          case ProviderNames.Google:
            return GoogleProvider({
              clientId: row.client_id,
              clientSecret: row.client_secret,
              authorization: {
                params: { access_type: "offline", prompt: "consent" },
              },
            });
          case ProviderNames.HubSpot:
            return HubspotProvider({
              clientId: row.client_id,
              clientSecret: row.client_secret,
            });
          case ProviderNames.LinkedIn:
            return LinkedInProvider({
              clientId: row.client_id,
              clientSecret: row.client_secret,
              client: { token_endpoint_auth_method: "client_secret_post" },
              issuer: "https://www.linkedin.com",
              profile: (profile: LinkedInProfile) => ({
                id: profile.sub,
                name: profile.name,
                email: profile.email,
                image: profile.picture,
              }),
              wellKnown:
                "https://www.linkedin.com/oauth/.well-known/openid-configuration",
              authorization: {
                params: {
                  scope: "openid profile email",
                },
              },
            });
          case ProviderNames.Slack:
            return SlackProvider({
              clientId: row.client_id,
              clientSecret: row.client_secret,
            });
          case ProviderNames.X:
            return TwitterProvider({
              clientId: row.client_id,
              clientSecret: row.client_secret,
              version: "2.0",
            });
        }
      })
      .filter(Boolean);
    if (configuredProviders.length === 0) {
      error("No providers configured");
    } else {
      debug(`${enabledProviders.join(", ")} enabled for ${params.database}`);
    }
    return [configuredProviders];
  }
  return [null];
}
