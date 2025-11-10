import { AuthOptions as NextAuthOptions } from "next-auth";

export type AuthOptions = NextAuthOptions & DbInfo;
export type DbInfo = {
  host: string;
  database: string;
  user: string;
  password: string;
  port: number;
};

export enum ProviderNames {
  Azure = "azure",
  Credentials = "Credentials", // keep as caps, legacy
  Discord = "discord",
  Email = "Email", // keeps as caps, legacy
  Github = "github",
  Google = "google",
  HubSpot = "hubSpot",
  LinkedIn = "linkedIn",
  Slack = "slack",
  X = "x (twitter)",
  MultiFactor = "multifactor",
}

export type Provider = {
  id: string;
  name: ProviderNames;
  auth_type: "SOCIAL" | "SSO";
  created: string;
  updated: string;
  deleted: string;
  enabled: boolean;
  config_url: boolean;
  redirect_url: boolean;
  config: Record<string, string>;
  ttl_sec: boolean;
};

type OidcPayload = {
  type: string;
  scope: string;
  expires_at: number;
  token_type: string;
  access_token: string;
  refresh_token: string;
};
export type CredentialRow<T = OidcPayload> = {
  id: string;
  user_id: string;
  created: Date;
  updated: Date;
  deleted: null | Date;
  method: `${ProviderMethods}`;
  provider: `${ProviderNames}` | "nile";
  payload: T;
  provider_account_id: string | null;
};

export enum ProviderMethods {
  EMAIL_PASSWORD = "EMAIL_PASSWORD",
  OIDC = "OIDC",
  PASSWORD = "PASSWORD",
  PLAIN_TEXT = "PLAIN_TEXT",
  MFA = "MFA",
}

export enum ActionableErrors {
  notVerified = "Not verified",
  mfaRequired = "mfaRequired",
}
