import { randomInt } from "crypto";
import { ActionableErrors, ProviderNames } from "../types";
import {
  ChallengeRecord,
  ChallengeScope,
  MfaConfig,
  MultiFactorMethod,
} from "./types";
import { CHALLENGE_PREFIX, SETUP_PREFIX } from "./constants";

export function isMultiFactorMethod(
  value: unknown,
): value is MultiFactorMethod {
  return (
    typeof value === "string" &&
    (Object.values(MultiFactorMethod) as string[]).includes(value)
  );
}

export function normalizeConfig(
  config?: Partial<MfaConfig> | null,
): MfaConfig | null {
  if (!config) {
    return null;
  }
  return {
    email: Boolean(config.email),
    authenticator: Boolean(config.authenticator),
  };
}

export function resolveConfigMethod(
  config?: MfaConfig | null,
): MultiFactorMethod | null {
  if (!config) {
    return null;
  }
  if (config.authenticator) {
    return MultiFactorMethod.Authenticator;
  }
  if (config.email) {
    return MultiFactorMethod.Email;
  }
  return null;
}

export function normalizeProviderKey(
  provider?: string | ProviderNames | null,
): string | null {
  if (!provider) {
    return null;
  }
  if (typeof provider === "string") {
    return provider.trim().toLowerCase() || null;
  }
  return String(provider).trim().toLowerCase() || null;
}

export function generateNumericCode(length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += randomInt(10).toString();
  return s;
}
export function maskEmail(email?: string | null): string | undefined {
  if (!email) {
    return undefined;
  }
  const [local, domain] = email.split("@");
  if (!domain) {
    return "*****";
  }
  if (local?.length ?? 0 <= 2) {
    return `${local?.[0] ?? "*"}***@${domain}`;
  }
  const maskedLocal =
    local?.[0] +
    "*".repeat(Math.max(local?.length ?? 0 - 2, 1)) +
    local?.slice(-1);
  return `${maskedLocal}@${domain}`;
}
export function encodeMfaPayload(payload: ChallengeRecord): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeMfaPayload(encoded: string) {
  const json = Buffer.from(encoded, "base64url").toString("utf8");
  return JSON.parse(json) as ChallengeRecord;
}

export function buildMfaError(encoded: string): Error {
  return new Error(`${ActionableErrors.mfaRequired}:${encoded}`);
}

export function mfaIdentifier(
  scope: ChallengeScope | undefined,
  token: string,
) {
  const challengeScope = getChallengeScope(scope);
  const prefix =
    challengeScope === ChallengeScope.Setup ? SETUP_PREFIX : CHALLENGE_PREFIX;
  return `${prefix}${token}`;
}

export function getChallengeScope(
  scope: ChallengeScope | undefined,
): ChallengeScope {
  const scopeCandidate =
    (scope as ChallengeScope | undefined) ?? ChallengeScope.Challenge;
  return (Object.values(ChallengeScope) as string[]).includes(scopeCandidate)
    ? scopeCandidate
    : ChallengeScope.Challenge;
}
