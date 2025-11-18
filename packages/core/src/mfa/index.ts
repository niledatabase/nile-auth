import { AdapterUser } from "next-auth/adapters";
import { authenticator } from "otplib";

import { Logger } from "@nile-auth/logger";
import { DbCreds } from "@nile-auth/query/getDbInfo";

import { createHash as createCsrfHash } from "../next-auth/csrf";

import { getMfaResponse } from "./providerResponse";
import { ChallengeRecord, ChallengeScope } from "./types";

const { warn } = Logger("[mfa]");

authenticator.options = {
  step: 30,
  window: 1, // allow +/- one 30s window to account for drift
};

export async function ensureMfaChallenge(params: {
  req: Request;
  dbInfo?: DbCreds;
  user?: AdapterUser;
}): Promise<ChallengeRecord | null> {
  const { dbInfo, user, req } = params;
  if (!dbInfo || !user?.id) {
    return null;
  }

  try {
    const result = await getMfaResponse({
      req,
      dbInfo,
      userId: user.id,
    });

    if (!result || result.scope !== ChallengeScope.Challenge) {
      return null;
    }

    return result;
  } catch (e) {
    if (e instanceof Error) {
      warn("Unable to create MFA challenge", {
        message: e.message,
        stack: e.stack,
        cause: e.cause,
      });
    }
    throw e;
  }
}

export function verifyAuthenticatorToken(params: {
  secret: string;
  token: string;
}): boolean {
  const { secret, token } = params;
  if (!secret) {
    return false;
  }
  return authenticator.verify({
    token,
    secret,
  });
}

export async function verifyEmailOtpToken(params: {
  otp: string;
  storedHash: string;
}): Promise<boolean> {
  const { otp, storedHash } = params;
  if (!storedHash) {
    return false;
  }
  const expected = await createCsrfHash(`${otp}${process.env.NEXTAUTH_SECRET}`);
  return expected === storedHash;
}

export {
  encryptAuthenticatorSecret,
  decryptAuthenticatorSecret,
} from "./authenticatorSecret";

export * from "./types";
export { getMfaResponse } from "./providerResponse";
export { mfaIdentifier, getChallengeScope } from "./utils";
export { CHALLENGE_PREFIX, SETUP_PREFIX } from "./constants";
