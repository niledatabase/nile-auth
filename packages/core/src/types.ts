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
}
