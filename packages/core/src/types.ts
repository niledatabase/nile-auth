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
