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

import { query, ResultSet, sqlTemplate } from "@nile-auth/query";
import { DbCreds } from "@nile-auth/query/getDbInfo";
import { Logger } from "@nile-auth/logger";

import { Provider, ProviderNames } from "../types";
import { addContext } from "@nile-auth/query/context";
import { Provider as NextAuthProvider } from "next-auth/providers/index";

type RelyingParty = {
  id: string;
  provider: string;
  created: string;
  updated: string;
  deleted: string;
  client_id: string;
  client_secret: string;
  enabled: string;
  config: Record<string, string>;
};

const { error, debug } = Logger("[providers]");

export async function getProviders(
  params: DbCreds,
  tenantId?: null | string,
): Promise<[null | NextAuthProvider[]]> {
  const pool = new Pool(params);

  const enabledProviders: string[] = [];
  const sql = await sqlTemplate(params);
  // do some pg here, to get providers
  const [[providers], [credentials], [, tenantProviders]] = await Promise.all([
    (await sql`
      SELECT
        *
      FROM
        auth.oidc_providers
      WHERE
        enabled = TRUE
        AND deleted IS NULL
    `) as unknown as Promise<ResultSet<Provider[]>[]>,
    (await sql`
      SELECT
        *
      FROM
        auth.oidc_relying_parties
      WHERE
        enabled = TRUE
        AND deleted IS NULL
    `) as unknown as Promise<ResultSet<RelyingParty[]>[]>,
    tenantId
      ? ((await sql`
          ${addContext({ tenantId })};

          SELECT
            *
          FROM
            auth.tenant_oidc_relying_parties
        `) as [null, ResultSet<{ provider_name: string; enabled: boolean }[]>])
      : ([] as unknown as Promise<
          [null, ResultSet<{ provider_name: string; enabled: boolean }[]>]
        >),
    ,
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
      .filter((provider: Provider) => {
        if (!provider.enabled) {
          return;
        }
        if (tenantProviders && "rows" in tenantProviders) {
          const tenantOverride = tenantProviders.rows.find(
            (p) => p.provider_name === provider.name,
          );
          if (tenantOverride && "enabled" in tenantOverride) {
            if (tenantOverride.enabled === false) {
              return;
            }
          }
        }

        return provider;
      })
      .map(async (provider: Provider) => {
        enabledProviders.push(provider.name);

        // special providers that need some kind of customization
        switch (provider.name) {
          case ProviderNames.Email:
            return await EmailProvider(provider, params);
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
    const ps = await Promise.all(configuredProviders);
    if (ps.length === 0) {
      error("No providers configured");
    } else {
      debug(
        `${enabledProviders.join(", ")} enabled on ${params.database} ${tenantId ? `for tenant ${tenantId}` : ""}`,
      );
    }

    return [ps as NextAuthProvider[]];
  }
  return [null];
}
