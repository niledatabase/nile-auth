import { query } from "@nile-auth/query";

export enum MultiFactorMethod {
  Authenticator = "authenticator",
  Email = "email",
}

export enum ChallengeScope {
  Challenge = "challenge",
  Setup = "setup",
}

export type ChallengeRecord = {
  token: string;
  expiresAt: string;
  method: MultiFactorMethod;
  scope: ChallengeScope;
};

export type SqlClient = Awaited<ReturnType<typeof query>>;

export type MfaIdentifier = {
  userId?: string;
  email?: string;
};

export type MfaUserRow = {
  id: string;
  email: string | null;
  name: string | null;
  multi_factor: MultiFactorMethod | null;
};

export type MfaConfig = {
  email: boolean;
  authenticator: boolean;
};

export type SetupChallengeResult = {
  token: string;
  expiresAt: string;
  scope: ChallengeScope;
  method: MultiFactorMethod;
  secret?: string;
  otpauthUrl?: string;
  maskedEmail?: string;
  recoveryKeys?: string[];
};
