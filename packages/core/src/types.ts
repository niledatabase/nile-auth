import { AuthOptions as NextAuthOptions } from "next-auth";

export type AuthOptions = NextAuthOptions &
  DbInfo & {
    useJwt?: boolean;
  };
export type DbInfo = {
  host: string;
  database: string;
  user: string;
  password: string;
  port: number;
};

export enum ProviderNames {
  Google = "google",
  Unknown = "unknown",
  Github = "Github",
  GoogleBeta = "Google",
  Credentials = "Credentials",
  Email = "Email",
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
