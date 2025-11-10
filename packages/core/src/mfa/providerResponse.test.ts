const poolInstances: Array<{ end: jest.Mock }> = [];

jest.mock("pg", () => ({
  Pool: jest.fn(() => {
    const instance = {
      end: jest.fn().mockResolvedValue(undefined),
    };
    poolInstances.push(instance);
    return instance;
  }),
}));

jest.mock("@nile-auth/query", () => ({
  query: jest.fn(),
}));

jest.mock("./sql", () => ({
  fetchMfaUser: jest.fn(),
  fetchProviderConfig: jest.fn(),
}));

jest.mock("./recoveryKeys", () => ({
  storeAuthenticatorSecret: jest.fn(),
}));

jest.mock("../next-auth/providers/email", () => ({
  Template: {},
  Variable: {},
  generateEmailBody: jest.fn(),
  send2FaEmail: jest.fn(),
  sendEmail: jest.fn(),
}));

jest.mock("../next-auth/csrf", () => ({
  createHash: jest.fn(),
}));

jest.mock("../utils", () => ({
  randomString: jest.fn(),
}));

jest.mock("../next-auth/cookies", () => ({
  findCallbackCookie: jest.fn(),
}));

jest.mock("./utils", () => {
  const actual = jest.requireActual("./utils");
  return {
    ...actual,
    generateNumericCode: jest.fn(),
  };
});

const authenticatorMock = {
  options: {},
  verify: jest.fn(),
  generateSecret: jest.fn(),
  keyuri: jest.fn(),
};

jest.mock("otplib", () => ({
  authenticator: authenticatorMock,
}));

import { query } from "@nile-auth/query";
import { findCallbackCookie } from "../next-auth/cookies";
import { createHash } from "../next-auth/csrf";
import { randomString } from "../utils";
import { send2FaEmail } from "../next-auth/providers/email";
import { fetchMfaUser, fetchProviderConfig } from "./sql";
import { storeAuthenticatorSecret } from "./recoveryKeys";
import { generateNumericCode } from "./utils";
import { buildProviderMfaResponse, getMfaResponse } from "./providerResponse";
import {
  ChallengeScope,
  MfaConfig,
  MfaUserRow,
  MultiFactorMethod,
} from "./types";
import { ProviderNames } from "../types";

const queryMock = query as jest.MockedFunction<typeof query>;
const fetchMfaUserMock = fetchMfaUser as jest.MockedFunction<
  typeof fetchMfaUser
>;
const fetchProviderConfigMock = fetchProviderConfig as jest.MockedFunction<
  typeof fetchProviderConfig
>;
const storeAuthenticatorSecretMock =
  storeAuthenticatorSecret as jest.MockedFunction<
    typeof storeAuthenticatorSecret
  >;
const send2FaEmailMock = send2FaEmail as jest.MockedFunction<
  typeof send2FaEmail
>;
const createHashMock = createHash as jest.MockedFunction<typeof createHash>;
const randomStringMock = randomString as jest.MockedFunction<
  typeof randomString
>;
const generateNumericCodeMock = generateNumericCode as jest.MockedFunction<
  typeof generateNumericCode
>;

describe("mfa/providerResponse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    poolInstances.length = 0;
    queryMock.mockReset();
    fetchMfaUserMock.mockReset();
    fetchProviderConfigMock.mockReset();
    storeAuthenticatorSecretMock.mockReset();
    send2FaEmailMock.mockReset();
    createHashMock.mockReset();
    randomStringMock.mockReset();
    generateNumericCodeMock.mockReset();
    authenticatorMock.generateSecret.mockReset();
    authenticatorMock.keyuri.mockReset();
    authenticatorMock.verify.mockReset();
    process.env.NEXTAUTH_SECRET = "unit-secret";
    randomStringMock.mockReturnValue("challenge-token");
    generateNumericCodeMock.mockReturnValue("123456");
    createHashMock.mockResolvedValue("hashed-otp");
  });

  describe("buildProviderMfaResponse", () => {
    it("returns null for non-callback credential routes", async () => {
      const handler = new Response(null, { status: 200 });
      const req = new Request("https://example.com/api/auth/signin", {
        method: "POST",
      });

      const result = await buildProviderMfaResponse(req, handler, {} as any, {
        nextauth: ["signin", "email"],
      });
      expect(result).toBeNull();
    });

    it("returns a MFA response payload when challenge is issued", async () => {
      const handler = new Response(null, { status: 401 });
      const form = new URLSearchParams();
      form.set("email", "user@example.com");
      form.set("callbackUrl", "/dashboard");
      const req = new Request("https://example.com/api/auth/callback", {
        method: "POST",
        body: form,
      });
      (findCallbackCookie as jest.Mock).mockReturnValue(
        "https://app.example.com/callback?existing=1",
      );
      const sqlMock = jest.fn(async (strings: TemplateStringsArray) => {
        if (strings.join(" ").includes("INSERT INTO")) {
          return { rows: [{ expires: "2025-01-01T00:00:00.000Z" }] };
        }
        return { rows: [] };
      });
      //@ts-expect-error - mock
      queryMock.mockResolvedValueOnce(sqlMock);
      fetchMfaUserMock.mockResolvedValueOnce({
        id: "user-123",
        email: "user@example.com",
        name: "User",
        multi_factor: MultiFactorMethod.Authenticator,
      } as MfaUserRow);

      const result = await buildProviderMfaResponse(
        req,
        handler,
        { host: "localhost" } as any,
        { nextauth: ["callback", "credentials"] },
      );

      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
      const payload = await result?.json();
      expect(payload).toMatchObject({
        token: "challenge-token",
        method: MultiFactorMethod.Authenticator,
        scope: ChallengeScope.Challenge,
      });
      const url = new URL(String(payload.url));
      expect(url.pathname).toBe("/dashboard");
      expect(url.searchParams.get("token")).toBe("challenge-token");
      expect(url.searchParams.get("method")).toBe(
        MultiFactorMethod.Authenticator,
      );
      expect(url.searchParams.get("scope")).toBe(ChallengeScope.Challenge);
    });

    it("returns null when MFA response generation fails", async () => {
      const handler = new Response(null, { status: 401 });
      const req = new Request("https://example.com/api/auth/callback", {
        method: "POST",
        body: JSON.stringify({ email: "user@example.com" }),
        headers: { "content-type": "application/json" },
      });
      (findCallbackCookie as jest.Mock).mockReturnValue(
        "https://app.example.com/callback",
      );
      const providerModule =
        require("./providerResponse") as typeof import("./providerResponse");
      const getMfaResponseSpy = jest
        .spyOn(providerModule, "getMfaResponse")
        .mockRejectedValueOnce(new Error("db offline"));

      const result = await buildProviderMfaResponse(
        req,
        handler,
        { host: "localhost" } as any,
        { nextauth: ["callback", "credentials"] },
      );

      expect(result).toBeNull();
      getMfaResponseSpy.mockRestore();
    });
  });

  describe("getMfaResponse", () => {
    it("returns null when db info or identity is missing", async () => {
      await expect(
        getMfaResponse({ req: new Request("https://example.com") }),
      ).resolves.toBeNull();
      await expect(
        getMfaResponse({
          req: new Request("https://example.com"),
          dbInfo: {} as any,
        }),
      ).resolves.toBeNull();
    });

    it("returns null when user cannot be found", async () => {
      const sqlMock = jest.fn();
      //@ts-expect-error - mock
      queryMock.mockResolvedValueOnce(sqlMock);
      fetchMfaUserMock.mockResolvedValueOnce(null);

      await expect(
        getMfaResponse({
          req: new Request("https://example.com"),
          dbInfo: { host: "localhost" } as any,
          userId: "user-1",
        }),
      ).resolves.toBeNull();

      expect(fetchMfaUserMock).toHaveBeenCalled();
      expect(poolInstances).toHaveLength(1);
      expect(poolInstances[0]?.end).toHaveBeenCalled();
    });

    it("returns existing authenticator challenge when stored method is set", async () => {
      const sqlMock = jest.fn(async (strings: TemplateStringsArray) => {
        if (strings[0]?.includes("INSERT INTO")) {
          return {
            rows: [{ expires: "2025-01-01T00:00:00.000Z" }],
          };
        }
        return { rows: [] };
      });
      //@ts-expect-error - mock
      queryMock.mockResolvedValueOnce(sqlMock);
      fetchMfaUserMock.mockResolvedValueOnce({
        id: "user-123",
        email: "user@example.com",
        name: "User",
        multi_factor: MultiFactorMethod.Authenticator,
      } as MfaUserRow);

      const response = await getMfaResponse({
        req: new Request("https://example.com"),
        dbInfo: { host: "localhost" } as any,
        userId: "user-123",
      });

      expect(response).toMatchObject({
        token: "challenge-token",
        method: MultiFactorMethod.Authenticator,
        scope: ChallengeScope.Challenge,
        expiresAt: "2025-01-01T00:00:00.000Z",
      });
      expect(sqlMock).toHaveBeenCalledTimes(1);
      const [, identifier, payload, interval, fallbackInterval] = sqlMock.mock
        .calls[0] as any;
      expect(identifier).toBe("mfa:challenge:challenge-token");
      expect(payload).toContain('"method":"authenticator"');
      expect(interval).toBe("30 seconds");
      expect(fallbackInterval).toBe("30 seconds");
    });

    it("issues authenticator setup challenges with recovery keys", async () => {
      const sqlMock = jest.fn(
        async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const text = strings.join(" ");
          if (text.includes("SELECT") && text.includes("template_variables")) {
            return {
              rows: [{ name: "app_name", value: "Nile Cloud" }],
            };
          }
          if (
            text.includes("INSERT INTO") &&
            text.includes("verification_tokens")
          ) {
            return {
              rows: [{ expires: "2025-01-01T00:00:00.000Z" }],
            };
          }
          return { rows: [] };
        },
      );
      //@ts-expect-error - mock
      queryMock.mockResolvedValueOnce(sqlMock);
      fetchMfaUserMock.mockResolvedValueOnce({
        id: "user-setup",
        email: "user@example.com",
        name: "Setup User",
        multi_factor: null,
      } as MfaUserRow);
      fetchProviderConfigMock.mockResolvedValueOnce({
        authenticator: true,
        email: false,
      } as MfaConfig);
      storeAuthenticatorSecretMock.mockResolvedValueOnce(["RK1", "RK2"]);
      authenticatorMock.generateSecret.mockReturnValueOnce("AUTH-SECRET");
      authenticatorMock.keyuri.mockReturnValueOnce("otpauth://url");

      const result = await getMfaResponse({
        req: new Request("https://example.com"),
        dbInfo: { host: "localhost" } as any,
        userId: "user-setup",
        provider: ProviderNames.MultiFactor,
      });

      expect(result).toMatchObject({
        method: MultiFactorMethod.Authenticator,
        secret: "AUTH-SECRET",
        otpauthUrl: "otpauth://url",
        recoveryKeys: ["RK1", "RK2"],
        scope: ChallengeScope.Setup,
      });
      expect(storeAuthenticatorSecretMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-setup",
          secret: "AUTH-SECRET",
          issuer: "Nile Cloud",
        }),
      );
    });

    it("issues email setup challenge and sends OTP emails", async () => {
      const sqlMock = jest.fn(
        async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const text = strings.join(" ");
          if (
            text.includes("INSERT INTO") &&
            text.includes("verification_tokens")
          ) {
            return {
              rows: [{ expires: "2025-05-05T00:00:00.000Z" }],
            };
          }
          if (text.includes("DELETE FROM auth.verification_tokens")) {
            return { rows: [] };
          }
          return { rows: [] };
        },
      );
      //@ts-expect-error - mock
      queryMock.mockResolvedValueOnce(sqlMock);
      fetchMfaUserMock.mockResolvedValueOnce({
        id: "user-email",
        email: "person@example.com",
        name: "Person",
        multi_factor: null,
      } as MfaUserRow);
      send2FaEmailMock.mockResolvedValueOnce(undefined);

      const result = await getMfaResponse({
        req: new Request("https://example.com"),
        dbInfo: { host: "localhost" } as any,
        email: "person@example.com",
        config: { email: true, authenticator: false },
      });

      expect(result).toMatchObject({
        method: MultiFactorMethod.Email,
        scope: ChallengeScope.Setup,
        maskedEmail: "p***@example.com",
      });

      expect(generateNumericCodeMock).toHaveBeenCalledWith(6);
      expect(createHashMock).toHaveBeenCalledWith("123456unit-secret");
      expect(send2FaEmailMock).toHaveBeenCalledWith({
        req: expect.any(Request),
        json: expect.objectContaining({
          email: "person@example.com",
          name: "Person",
          otp: "123456",
        }),
      });
      expect(fetchProviderConfigMock).not.toHaveBeenCalled();
    });

    it("uses provider configuration when override is not supplied", async () => {
      const sqlMock = jest.fn(
        async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const text = strings.join(" ");
          if (
            text.includes("INSERT INTO") &&
            text.includes("verification_tokens")
          ) {
            return {
              rows: [{ expires: "2025-05-05T00:00:00.000Z" }],
            };
          }
          return { rows: [] };
        },
      );
      //@ts-expect-error - mock
      queryMock.mockResolvedValueOnce(sqlMock);
      fetchMfaUserMock.mockResolvedValueOnce({
        id: "user-email-provider",
        email: "user@example.com",
        name: "User",
        multi_factor: null,
      } as MfaUserRow);
      fetchProviderConfigMock.mockResolvedValueOnce({
        email: true,
        authenticator: false,
      } as MfaConfig);
      send2FaEmailMock.mockResolvedValueOnce(undefined);

      const result = await getMfaResponse({
        req: new Request("https://example.com"),
        dbInfo: { host: "localhost" } as any,
        email: "user@example.com",
        provider: ProviderNames.Email,
      });

      expect(fetchProviderConfigMock).toHaveBeenCalled();
      expect(result?.method).toBe(MultiFactorMethod.Email);
    });

    it("cleans up verification token when email delivery fails", async () => {
      const deleteCalls: string[] = [];
      const sqlMock = jest.fn(
        async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const text = strings.join(" ");
          if (
            text.includes("INSERT INTO") &&
            text.includes("verification_tokens")
          ) {
            return {
              rows: [{ expires: "2025-05-05T00:00:00.000Z" }],
            };
          }
          if (text.includes("DELETE FROM auth.verification_tokens")) {
            deleteCalls.push(text);
            return { rows: [] };
          }
          return { rows: [] };
        },
      );
      //@ts-expect-error - mock
      queryMock.mockResolvedValueOnce(sqlMock);
      fetchMfaUserMock.mockResolvedValueOnce({
        id: "user-email",
        email: "person@example.com",
        name: "Person",
        multi_factor: null,
      } as MfaUserRow);
      send2FaEmailMock.mockRejectedValueOnce(new Error("smtp down"));

      await expect(
        getMfaResponse({
          req: new Request("https://example.com"),
          dbInfo: { host: "localhost" } as any,
          email: "person@example.com",
          config: { email: true, authenticator: false },
        }),
      ).rejects.toThrow("smtp down");

      expect(deleteCalls).toHaveLength(1);
      expect(fetchProviderConfigMock).not.toHaveBeenCalled();
    });

    it("returns null when no MFA method is configured", async () => {
      const sqlMock = jest.fn().mockResolvedValue({ rows: [] });
      //@ts-expect-error - mock
      queryMock.mockResolvedValueOnce(sqlMock);
      fetchMfaUserMock.mockResolvedValueOnce({
        id: "user-null",
        email: "user@example.com",
        name: null,
        multi_factor: null,
      } as MfaUserRow);
      fetchProviderConfigMock.mockResolvedValueOnce(null);

      await expect(
        getMfaResponse({
          req: new Request("https://example.com"),
          dbInfo: { host: "localhost" } as any,
          email: "user@example.com",
        }),
      ).resolves.toBeNull();
    });

    it("throws when email method chosen without user email", async () => {
      const sqlMock = jest.fn(
        async (strings: TemplateStringsArray, ...values: unknown[]) => {
          if (strings.join(" ").includes("INSERT INTO")) {
            return { rows: [{ expires: "2025-05-05T00:00:00.000Z" }] };
          }
          return { rows: [] };
        },
      );
      //@ts-expect-error - mock
      queryMock.mockResolvedValueOnce(sqlMock);
      fetchMfaUserMock.mockResolvedValueOnce({
        id: "user-missing-email",
        email: null,
        name: "Person",
        multi_factor: null,
      } as MfaUserRow);
      fetchProviderConfigMock.mockResolvedValueOnce({
        email: true,
        authenticator: false,
      } as MfaConfig);

      await expect(
        getMfaResponse({
          req: new Request("https://example.com"),
          dbInfo: { host: "localhost" } as any,
          userId: "user-missing-email",
        }),
      ).rejects.toThrow("Cannot send email MFA challenge without a user email");
    });
  });
});
