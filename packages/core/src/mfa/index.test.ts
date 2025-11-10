const warnMock = jest.fn();

jest.mock("@nile-auth/logger", () => ({
  Logger: jest.fn(() => ({
    info: jest.fn(),
    warn: warnMock,
    debug: jest.fn(),
    error: jest.fn(),
    silly: jest.fn(),
    setMetadata: jest.fn(),
  })),
}));

jest.mock("./providerResponse", () => ({
  getMfaResponse: jest.fn(),
}));

const authenticatorVerifyMock = jest.fn();

jest.mock("otplib", () => ({
  authenticator: {
    options: {},
    verify: authenticatorVerifyMock,
  },
}));

jest.mock("../next-auth/csrf", () => ({
  createHash: jest.fn(),
}));

import { ensureMfaChallenge, verifyAuthenticatorToken, verifyEmailOtpToken } from "./index";
import { ChallengeScope, MultiFactorMethod } from "./types";
import { getMfaResponse } from "./providerResponse";
import { createHash } from "../next-auth/csrf";

const getMfaResponseMock =
  getMfaResponse as jest.MockedFunction<typeof getMfaResponse>;
const createHashMock = createHash as jest.MockedFunction<typeof createHash>;

describe("mfa/index", () => {
  beforeEach(() => {
    warnMock.mockClear();
    getMfaResponseMock.mockReset();
    authenticatorVerifyMock.mockReset();
    createHashMock.mockReset();
    process.env.NEXTAUTH_SECRET = "unit-secret";
  });

  it("returns null when db info or user is missing", async () => {
    const req = new Request("https://example.com");
    await expect(
      ensureMfaChallenge({ req, dbInfo: undefined, user: { id: "1" } as any }),
    ).resolves.toBeNull();
    await expect(
      ensureMfaChallenge({ req, dbInfo: {} as any, user: undefined }),
    ).resolves.toBeNull();
    expect(getMfaResponseMock).not.toHaveBeenCalled();
  });

  it("returns null when challenge scope is not Challenge", async () => {
    const req = new Request("https://example.com");
    const challenge = {
      token: "t",
      scope: ChallengeScope.Setup,
      expiresAt: "now",
      method: MultiFactorMethod.Email,
    };
    getMfaResponseMock.mockResolvedValueOnce(challenge);

    await expect(
      ensureMfaChallenge({ req, dbInfo: {} as any, user: { id: "1" } as any }),
    ).resolves.toBeNull();
  });

  it("returns challenge when response scope is Challenge", async () => {
    const req = new Request("https://example.com");
    const challenge = {
      token: "tok",
      scope: ChallengeScope.Challenge,
      method: MultiFactorMethod.Authenticator,
      expiresAt: "future",
    };
    getMfaResponseMock.mockResolvedValueOnce(challenge);
    const dbInfo = { host: "localhost" } as any;

    await expect(
      ensureMfaChallenge({ req, dbInfo, user: { id: "123" } as any }),
    ).resolves.toEqual(challenge);

    expect(getMfaResponseMock).toHaveBeenCalledWith({
      req,
      dbInfo,
      userId: "123",
    });
  });

  it("logs and rethrows errors from getMfaResponse", async () => {
    const req = new Request("https://example.com");
    const error = new Error("mfa boom");
    getMfaResponseMock.mockRejectedValueOnce(error);

    await expect(
      ensureMfaChallenge({ req, dbInfo: {} as any, user: { id: "u1" } as any }),
    ).rejects.toThrow(error);

    expect(warnMock).toHaveBeenCalledWith("Unable to create MFA challenge", {
      message: "mfa boom",
      stack: error.stack,
      cause: undefined,
    });
  });

  it("returns false when verifying authenticator token without secret", () => {
    expect(
      verifyAuthenticatorToken({ secret: "", token: "123456" }),
    ).toBe(false);
    expect(authenticatorVerifyMock).not.toHaveBeenCalled();
  });

  it("delegates authenticator token verification", () => {
    authenticatorVerifyMock.mockReturnValueOnce(true);
    expect(
      verifyAuthenticatorToken({ secret: "abc", token: "654321" }),
    ).toBe(true);
    expect(authenticatorVerifyMock).toHaveBeenCalledWith({
      secret: "abc",
      token: "654321",
    });
  });

  it("returns false when stored hash is missing for email OTP verification", async () => {
    await expect(
      verifyEmailOtpToken({ otp: "123456", storedHash: "" }),
    ).resolves.toBe(false);
    expect(createHashMock).not.toHaveBeenCalled();
  });

  it("validates email OTP tokens against stored hashes", async () => {
    createHashMock.mockResolvedValueOnce("expected-hash");

    await expect(
      verifyEmailOtpToken({ otp: "987654", storedHash: "expected-hash" }),
    ).resolves.toBe(true);

    expect(createHashMock).toHaveBeenCalledWith("987654unit-secret");
  });
});
