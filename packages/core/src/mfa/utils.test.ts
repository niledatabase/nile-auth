import { ActionableErrors, ProviderNames } from "../types";
import { CHALLENGE_PREFIX, SETUP_PREFIX } from "./constants";
import {
  ChallengeRecord,
  ChallengeScope,
  MfaConfig,
  MultiFactorMethod,
} from "./types";
import {
  buildMfaError,
  decodeMfaPayload,
  encodeMfaPayload,
  generateNumericCode,
  getChallengeScope,
  isMultiFactorMethod,
  maskEmail,
  mfaIdentifier,
  normalizeConfig,
  normalizeProviderKey,
  resolveConfigMethod,
} from "./utils";

describe("mfa/utils", () => {
  it("identifies valid multi-factor methods", () => {
    expect(isMultiFactorMethod(MultiFactorMethod.Authenticator)).toBe(true);
    expect(isMultiFactorMethod("email")).toBe(true);
    expect(isMultiFactorMethod("EMAIL")).toBe(false);
    expect(isMultiFactorMethod(null)).toBe(false);
  });

  it("normalizes MFA config", () => {
    expect(normalizeConfig(undefined)).toBeNull();
    expect(
      normalizeConfig({
        email: "yes" as unknown as boolean,
        authenticator: 0 as unknown as boolean,
      }),
    ).toEqual<MfaConfig>({ email: true, authenticator: false });
  });

  it("resolves preferred MFA method", () => {
    expect(resolveConfigMethod(undefined)).toBeNull();
    expect(
      resolveConfigMethod({ email: false, authenticator: false }),
    ).toBeNull();
    expect(
      resolveConfigMethod({ email: true, authenticator: false }),
    ).toBe(MultiFactorMethod.Email);
    expect(
      resolveConfigMethod({ email: true, authenticator: true }),
    ).toBe(MultiFactorMethod.Authenticator);
  });

  it("normalizes provider keys", () => {
    expect(normalizeProviderKey(undefined)).toBeNull();
    expect(normalizeProviderKey("  GitHub  ")).toBe("github");
    expect(normalizeProviderKey(ProviderNames.Email)).toBe("email");
    expect(normalizeProviderKey("   ")).toBeNull();
  });

  it("generates numeric codes using crypto randomInt", () => {
    const code = generateNumericCode(6);
    expect(code).toMatch(/^[0-9]{6}$/);
  });

  it("masks email addresses safely", () => {
    expect(maskEmail(undefined)).toBeUndefined();
    expect(maskEmail("invalid-email")).toBe("*****");
    expect(maskEmail("ab@example.com")).toBe("a***@example.com");
    expect(maskEmail("person@example.com")).toBe("p***@example.com");
  });

  it("encodes and decodes MFA payloads", () => {
    const payload: ChallengeRecord = {
      token: "token",
      expiresAt: new Date().toISOString(),
      method: MultiFactorMethod.Email,
      scope: ChallengeScope.Challenge,
    };

    const encoded = encodeMfaPayload(payload);
    expect(typeof encoded).toBe("string");
    expect(decodeMfaPayload(encoded)).toEqual(payload);
  });

  it("builds actionable MFA errors", () => {
    const payload: ChallengeRecord = {
      token: "abc",
      expiresAt: "2025-11-06T20:00:00Z",
      method: MultiFactorMethod.Authenticator,
      scope: ChallengeScope.Setup,
    };
    const encoded = encodeMfaPayload(payload);

    const error = buildMfaError(encoded);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(`${ActionableErrors.mfaRequired}:${encoded}`);
  });

  it("generates MFA identifiers for setup and challenge scopes", () => {
    expect(mfaIdentifier(ChallengeScope.Setup, "token")).toBe(
      `${SETUP_PREFIX}token`,
    );
    expect(mfaIdentifier(undefined, "token")).toBe(
      `${CHALLENGE_PREFIX}token`,
    );
  });

  it("guards challenge scope resolution", () => {
    expect(getChallengeScope(ChallengeScope.Setup)).toBe(
      ChallengeScope.Setup,
    );
    expect(getChallengeScope("invalid" as unknown as ChallengeScope)).toBe(
      ChallengeScope.Challenge,
    );
  });
});
