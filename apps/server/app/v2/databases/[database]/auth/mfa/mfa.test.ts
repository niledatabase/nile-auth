import { NextRequest } from "next/server";
import { authenticator } from "otplib";
import bcrypt from "bcryptjs";

import * as MfaModule from "@nile-auth/core/mfa";
import {
  MultiFactorMethod,
  ChallengeScope,
  encryptAuthenticatorSecret,
} from "@nile-auth/core/mfa";
import { createHash } from "@nile-auth/core/csrf";

import { POST, PUT, DELETE } from "./route";

jest.mock("@nile-auth/core/csrf", () => {
  const actual = jest.requireActual("@nile-auth/core/csrf");
  return {
    ...actual,
    validCsrfToken: jest.fn().mockResolvedValue([true, "csrf-token"]),
  };
});

jest.mock("../../../../../../../../packages/query/src/multiFactorColumn", () => {
  const actual = jest.requireActual(
    "../../../../../../../../packages/query/src/multiFactorColumn",
  );
  return {
    ...actual,
    hasMultiFactorColumn: jest.fn(),
  };
});

jest.mock("../../../../../../../../packages/query/src/query", () => {
  const actual = jest.requireActual(
    "../../../../../../../../packages/query/src/query",
  );
  return {
    ...actual,
    queryBySingle: jest.fn(),
  };
});

jest.mock("@nile-auth/core/cookies", () => ({
  getSecureCookies: jest.fn(() => false),
  getSessionTokenCookie: jest.fn(() => ({
    name: "session",
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  })),
}));

jest.mock("@nile-auth/core", () => ({
  auth: jest.fn(),
}));

const { hasMultiFactorColumn } = jest.requireMock(
  "../../../../../../../../packages/query/src/multiFactorColumn",
) as {
  hasMultiFactorColumn: jest.Mock;
};

const { queryBySingle } = jest.requireMock(
  "../../../../../../../../packages/query/src/query",
) as {
  queryBySingle: jest.Mock;
};

const { auth } = jest.requireMock("@nile-auth/core") as {
  auth: jest.Mock;
};

const getMfaResponseSpy = jest.spyOn(MfaModule, "getMfaResponse");

describe("PUT /auth/mfa", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getMfaResponseSpy.mockReset();
    process.env.NEXTAUTH_SECRET = "super-secret";
    hasMultiFactorColumn.mockResolvedValue(true);
  });

  it("deletes challenge when email code is invalid", async () => {
    const runCommands: string[] = [];
    const storedOtp = "123456";
    const hashedOtp = await createHash(
      `${storedOtp}${process.env.NEXTAUTH_SECRET}`,
    );

    const challengeRecord = {
      token: "bad-challenge-token",
      method: MultiFactorMethod.Email,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      scope: ChallengeScope.Challenge,
    };
    const storedPayload = {
      userId: "user-789",
      method: MultiFactorMethod.Email,
      otp: hashedOtp,
    };

    queryBySingle.mockReturnValueOnce(async function sql(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) {
      const rawValues = [...values];
      let text = strings[0] ?? "";
      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }
      rawValues.forEach((value, idx) => {
        let replacement: string;
        if (typeof value === "string") {
          replacement = value;
        } else if (value instanceof Date) {
          replacement = value.toISOString();
        } else {
          replacement = JSON.stringify(value);
        }
        text = text.replace(`$${idx + 1}`, replacement);
      });
      const normalized = text.replace(/(\n\s+)/g, " ").trim();
      if (normalized.includes("information_schema.columns")) {
        return {
          rows: [{ exists: 1 }],
          error: undefined,
        };
      }
      runCommands.push(normalized);

      if (normalized.includes("FROM auth.verification_tokens")) {
        return {
          rows: [
            {
              identifier: `mfa:challenge:${challengeRecord.token}`,
              token: JSON.stringify(storedPayload),
              expires: new Date(Date.now() + 60_000).toISOString(),
            },
          ],
          error: undefined,
        };
      }

      if (normalized.startsWith("DELETE FROM auth.verification_tokens")) {
        return {
          rows: [],
          error: undefined,
        };
      }

      return { rows: [], error: undefined };
    });

    const req = {
      url: "http://localhost",
      headers: new Headers(),
      async json() {
        return {
          token: challengeRecord.token,
          code: "000000",
          scope: challengeRecord.scope,
          method: challengeRecord.method,
        };
      },
    };

    const response = await PUT(req as NextRequest);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Invalid MFA code");

    expect(runCommands).toEqual([
      expect.stringContaining(
        "SELECT identifier, token, expires FROM auth.verification_tokens WHERE identifier = mfa:challenge:bad-challenge-token",
      ),
      expect.stringContaining(
        "DELETE FROM auth.verification_tokens WHERE identifier = mfa:challenge:bad-challenge-token",
      ),
    ]);
  });

  it("validates an email MFA challenge and issues a session cookie", async () => {
    const runCommands: string[] = [];
    const otp = "123456";
    const hashedOtp = await createHash(`${otp}${process.env.NEXTAUTH_SECRET}`);

    const challengeRecord = {
      token: "challenge-token",
      method: MultiFactorMethod.Email,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      scope: ChallengeScope.Challenge,
    };

    const storedPayload = {
      userId: "user-123",
      method: MultiFactorMethod.Email,
      otp: hashedOtp,
    };

    queryBySingle.mockReturnValueOnce(async function sql(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) {
      const rawValues = [...values];
      let text = strings[0] ?? "";
      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }
      rawValues.forEach((value, idx) => {
        let replacement: string;
        if (typeof value === "string") {
          replacement = value;
        } else if (value instanceof Date) {
          replacement = value.toISOString();
        } else {
          replacement = JSON.stringify(value);
        }
        text = text.replace(`$${idx + 1}`, replacement);
      });
      const normalized = text.replace(/(\n\s+)/g, " ").trim();
      if (normalized.includes("information_schema.columns")) {
        return {
          rows: [{ exists: 1 }],
          error: undefined,
        };
      }
      runCommands.push(normalized);

      if (normalized.includes("FROM auth.verification_tokens")) {
        return {
          rows: [
            {
              identifier: `${ChallengeScope.Setup === challengeRecord.scope ? "mfa:setup:" : "mfa:challenge:"}${challengeRecord.token}`,
              token: JSON.stringify(storedPayload),
              expires: new Date(Date.now() + 60_000).toISOString(),
            },
          ],
          error: undefined,
        };
      }

      if (normalized.includes("FROM users.users")) {
        return {
          rows: [
            {
              id: storedPayload.userId,
              email: "user@example.com",
            },
          ],
          error: undefined,
        };
      }

      if (normalized.startsWith("INSERT INTO auth.sessions")) {
        return {
          rows: [{ session_token: rawValues[1] }],
          error: undefined,
        };
      }

      if (normalized.startsWith("DELETE FROM auth.verification_tokens")) {
        return {
          rows: [],
          error: undefined,
        };
      }

      return { rows: [], error: undefined };
    });

    const req = {
      url: "http://localhost",
      headers: new Headers(),
      async json() {
        return {
          token: challengeRecord.token,
          code: otp,
          scope: challengeRecord.scope,
          method: challengeRecord.method,
        };
      },
    };

    const response = await PUT(req as NextRequest);

    expect(response.status).toBe(200);
    const body = await response.clone().json();
    expect(body).toEqual({ ok: true, scope: ChallengeScope.Challenge });

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toEqual(expect.stringContaining("session="));

    expect(runCommands).toEqual([
      expect.stringContaining(
        "SELECT identifier, token, expires FROM auth.verification_tokens WHERE identifier = mfa:challenge:challenge-token",
      ),
      expect.stringContaining("SELECT id, email FROM users.users"),
      expect.stringContaining(
        "INSERT INTO auth.sessions (user_id, session_token, expires_at)",
      ),
      expect.stringContaining(
        "DELETE FROM auth.verification_tokens WHERE identifier = mfa:challenge:challenge-token",
      ),
    ]);
  });

  it("satisfies an authenticator challenge using a recovery code and returns remaining count", async () => {
    const runCommands: string[] = [];
    const secret = authenticator.generateSecret();
    const hashedPrimary = await bcrypt.hash("RCVR-0001-0002", 8);
    const hashedSecondary = await bcrypt.hash("RCVR-0003-0004", 8);

    queryBySingle.mockReturnValueOnce(async function sql(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) {
      const rawValues = [...values];
      let text = strings[0] ?? "";
      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }
      rawValues.forEach((value, idx) => {
        let replacement: string;
        if (typeof value === "string") {
          replacement = value;
        } else if (value instanceof Date) {
          replacement = value.toISOString();
        } else if (Array.isArray(value)) {
          replacement = `{${value.join(",")}}`;
        } else {
          replacement = JSON.stringify(value);
        }
        text = text.replace(`$${idx + 1}`, replacement);
      });
      const normalized = text.replace(/(\n\s+)/g, " ").trim();
      if (normalized.includes("information_schema.columns")) {
        return {
          rows: [{ exists: 1 }],
          error: undefined,
        };
      }
      runCommands.push(normalized);

      if (
        normalized.startsWith(
          "SELECT identifier, token, expires FROM auth.verification_tokens",
        )
      ) {
        return {
          rows: [
            {
              identifier: "mfa:challenge:auth-challenge",
              token: JSON.stringify({
                userId: "user-123",
                method: MultiFactorMethod.Authenticator,
              }),
              expires: new Date(Date.now() + 60_000).toISOString(),
            },
          ],
          error: undefined,
        };
      }

      if (normalized.startsWith("SELECT id, payload FROM auth.credentials")) {
        return {
          rows: [
            {
              id: "credential-123",
              payload: {
                secret,
                recovery_codes: [
                  { crypt: "crypt-bf/8", hash: hashedPrimary },
                  { crypt: "crypt-bf/8", hash: hashedSecondary },
                ],
              },
            },
          ],
          error: undefined,
        };
      }

      if (
        normalized.startsWith("UPDATE auth.credentials SET payload = jsonb_set")
      ) {
        return { rows: [], error: undefined };
      }

      if (normalized.startsWith("SELECT id, email FROM users.users")) {
        return {
          rows: [{ id: "user-123", email: "user@example.com" }],
          error: undefined,
        };
      }

      if (normalized.startsWith("INSERT INTO auth.sessions")) {
        return {
          rows: [{ session_token: "session-token" }],
          error: undefined,
        };
      }

      if (normalized.startsWith("DELETE FROM auth.verification_tokens")) {
        return { rows: [], error: undefined };
      }

      return { rows: [], error: undefined };
    });

    const req = {
      url: "http://localhost/v2/databases/db/auth/mfa",
      headers: new Headers(),
      async json() {
        return {
          token: "auth-challenge",
          scope: ChallengeScope.Challenge,
          method: MultiFactorMethod.Authenticator,
          code: "rcvr 0001 0002",
        };
      },
    };

    const response = await PUT(req as NextRequest);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/session=/i);

    const body = await response.clone().json();
    expect(body).toEqual({
      ok: true,
      scope: ChallengeScope.Challenge,
      recoveryCodesRemaining: 1,
    });

    expect(runCommands).toEqual([
      expect.stringContaining(
        "SELECT identifier, token, expires FROM auth.verification_tokens WHERE identifier = mfa:challenge:auth-challenge",
      ),
      expect.stringContaining("SELECT id, payload FROM auth.credentials"),
      expect.stringContaining(
        "UPDATE auth.credentials SET payload = jsonb_set(",
      ),
      expect.stringContaining(
        "SELECT id, email FROM users.users WHERE id = user-123",
      ),
      expect.stringContaining(
        "INSERT INTO auth.sessions (user_id, session_token, expires_at)",
      ),
      expect.stringContaining(
        "DELETE FROM auth.verification_tokens WHERE identifier = mfa:challenge:auth-challenge",
      ),
    ]);
  });

  it("verifies authenticator setup and updates multi_factor without issuing a session", async () => {
    const runCommands: string[] = [];

    const secret = authenticator.generateSecret();
    const totp = authenticator.generate(secret);

    const challengeRecord = {
      token: "setup-token",
      method: MultiFactorMethod.Authenticator,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      scope: ChallengeScope.Setup,
    };
    const storedPayload = {
      userId: "user-456",
      method: MultiFactorMethod.Authenticator,
    };

    queryBySingle.mockReturnValueOnce(async function sql(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) {
      const rawValues = [...values];
      let text = strings[0] ?? "";
      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }
      rawValues.forEach((value, idx) => {
        let replacement: string;
        if (typeof value === "string") {
          replacement = value;
        } else if (value instanceof Date) {
          replacement = value.toISOString();
        } else {
          replacement = JSON.stringify(value);
        }
        text = text.replace(`$${idx + 1}`, replacement);
      });
      const normalized = text.replace(/(\n\s+)/g, " ").trim();
      if (normalized.includes("information_schema.columns")) {
        return {
          rows: [{ exists: 1 }],
          error: undefined,
        };
      }
      runCommands.push(normalized);

      if (normalized.includes("FROM auth.verification_tokens")) {
        return {
          rows: [
            {
              identifier: `${ChallengeScope.Setup === challengeRecord.scope ? "mfa:setup:" : "mfa:challenge:"}${challengeRecord.token}`,
              token: JSON.stringify(storedPayload),
              expires: new Date(Date.now() + 60_000).toISOString(),
            },
          ],
          error: undefined,
        };
      }

      if (normalized.includes("FROM auth.credentials")) {
        const encryptedSecret = encryptAuthenticatorSecret(secret);
        return {
          rows: [
            {
              payload: {
                secret_encrypted: encryptedSecret,
              },
            },
          ],
          error: undefined,
        };
      }

      if (normalized.includes("FROM users.users")) {
        return {
          rows: [
            {
              id: storedPayload.userId,
              email: "user@example.com",
            },
          ],
          error: undefined,
        };
      }

      if (normalized.startsWith("UPDATE users.users")) {
        return {
          rows: [],
          error: undefined,
        };
      }

      if (normalized.startsWith("DELETE FROM auth.verification_tokens")) {
        return {
          rows: [],
          error: undefined,
        };
      }

      return { rows: [], error: undefined };
    });

    const req = {
      url: "http://localhost",
      headers: new Headers(),
      async json() {
        return {
          token: challengeRecord.token,
          code: totp,
          scope: challengeRecord.scope,
          method: challengeRecord.method,
        };
      },
    };

    const response = await PUT(req as NextRequest);

    expect(response.status).toBe(200);
    const body = await response.clone().json();
    expect(body).toEqual({ ok: true, scope: ChallengeScope.Setup });

    expect(response.headers.get("Set-Cookie")).toBeNull();

    expect(runCommands).toEqual([
      expect.stringContaining(
        "SELECT identifier, token, expires FROM auth.verification_tokens WHERE identifier = mfa:setup:setup-token",
      ),
      expect.stringContaining("SELECT id, payload FROM auth.credentials"),
      expect.stringContaining("SELECT id, email FROM users.users"),
      expect.stringContaining(
        "UPDATE users.users SET multi_factor = authenticator WHERE id = user-456",
      ),
      expect.stringContaining(
        "DELETE FROM auth.verification_tokens WHERE identifier = mfa:setup:setup-token",
      ),
    ]);
  });
});

describe("POST /auth/mfa", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getMfaResponseSpy.mockReset();
    process.env.NILEDB_USER = "user";
    process.env.NILEDB_PASSWORD = "password";
    process.env.NILEDB_HOST = "localhost";
    process.env.NILEDB_NAME = "db";
  });

  it("returns 401 when user is unauthenticated", async () => {
    auth.mockResolvedValueOnce([{}]);

    const req = {
      url: "http://localhost/v2/databases/db/auth/mfa",
      headers: new Headers(),
    };

    const response = await POST(req as NextRequest);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
    expect(getMfaResponseSpy).not.toHaveBeenCalled();
  });

  it("creates an authenticator challenge and returns bootstrap data", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    auth.mockResolvedValueOnce([{ user: { id: "user-123", email: "user@example.com", name: "User" } }]);
    getMfaResponseSpy.mockResolvedValueOnce({
      token: "setup-token",
      expiresAt,
      scope: ChallengeScope.Setup,
      method: MultiFactorMethod.Authenticator,
      secret: "BASE32SECRET",
      otpauthUrl: "otpauth://totp/User?secret=BASE32SECRET",
      recoveryKeys: ["RCVR-0001", "RCVR-0002", "RCVR-0003", "RCVR-0004", "RCVR-0005", "RCVR-0006", "RCVR-0007"],
    });

    const req = {
      url: "http://localhost/v2/databases/db/auth/mfa",
      headers: new Headers(),
    };

    const response = await POST(req as NextRequest);

    expect(response.status).toBe(201);
    const json = await response.clone().json();
    expect(json).toEqual({
      ok: true,
      method: MultiFactorMethod.Authenticator,
      token: "setup-token",
      expiresAt,
      scope: ChallengeScope.Setup,
      otpauthUrl: "otpauth://totp/User?secret=BASE32SECRET",
      secret: "BASE32SECRET",
      recoveryKeys: [
        "RCVR-0001",
        "RCVR-0002",
        "RCVR-0003",
        "RCVR-0004",
        "RCVR-0005",
        "RCVR-0006",
        "RCVR-0007",
      ],
    });
    expect(getMfaResponseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dbInfo: expect.any(Object),
        userId: "user-123",
        config: { authenticator: true, email: true },
        forceSetup: false,
      }),
    );
  });

  it("creates an email challenge and masks destination", async () => {
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    auth.mockResolvedValueOnce([{ user: { id: "user-456", email: "person@example.com" } }]);
    getMfaResponseSpy.mockResolvedValueOnce({
      token: "email-setup",
      expiresAt,
      scope: ChallengeScope.Setup,
      method: MultiFactorMethod.Email,
      maskedEmail: "p***n@example.com",
    });

    const req = {
      url: "http://localhost/v2/databases/db/auth/mfa",
      headers: new Headers(),
    };

    const response = await POST(req as NextRequest);
    expect(response.status).toBe(201);
    const json = await response.clone().json();
    expect(json).toEqual({
      ok: true,
      method: MultiFactorMethod.Email,
      token: "email-setup",
      expiresAt,
      scope: ChallengeScope.Setup,
      maskedEmail: "p***n@example.com",
    });
    expect(getMfaResponseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dbInfo: expect.any(Object),
        userId: "user-456",
        config: { authenticator: true, email: true },
        forceSetup: false,
      }),
    );
  });

  it("returns an MFA challenge when requested", async () => {
    const expiresAt = new Date(Date.now() + 30_000).toISOString();

    auth.mockResolvedValueOnce([{ user: { id: "user-789", email: "user@example.com" } }]);
    getMfaResponseSpy.mockResolvedValueOnce({
      token: "challenge-token",
      expiresAt,
      scope: ChallengeScope.Challenge,
      method: MultiFactorMethod.Email,
    });

    const req = {
      url: "http://localhost/v2/databases/db/auth/mfa",
      headers: new Headers({ "content-type": "application/json" }),
      async json() {
        return { scope: ChallengeScope.Challenge };
      },
    };

    const response = await POST(req as NextRequest);
    expect(response.status).toBe(200);
    const json = await response.clone().json();
    expect(json).toEqual({
      ok: true,
      token: "challenge-token",
      expiresAt,
      scope: ChallengeScope.Challenge,
      method: MultiFactorMethod.Email,
    });
    expect(getMfaResponseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dbInfo: expect.any(Object),
        userId: "user-789",
        config: { authenticator: true, email: true },
        forceSetup: false,
      }),
    );
  });
});

describe("DELETE /auth/mfa", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getMfaResponseSpy.mockReset();
    process.env.NEXTAUTH_SECRET = "super-secret";
  });

  it("returns 401 when user is unauthenticated", async () => {
    auth.mockResolvedValueOnce([{}]);

    const req = {
      url: "http://localhost/v2/databases/db/auth/mfa",
      headers: new Headers(),
    };

    const response = await DELETE(req as NextRequest);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
  });

  it("disables authenticator MFA when a valid code is provided", async () => {
    const runCommands: string[] = [];
    const secret = authenticator.generateSecret();
    const code = authenticator.generate(secret);

    auth.mockResolvedValueOnce([
      { user: { id: "user-123", email: "user@example.com" } },
    ]);

    queryBySingle.mockReturnValueOnce(async function sql(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) {
      const rawValues = [...values];
      let text = strings[0] ?? "";
      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }
      rawValues.forEach((value, idx) => {
        let replacement: string;
        if (typeof value === "string") {
          replacement = value;
        } else if (value instanceof Date) {
          replacement = value.toISOString();
        } else if (Array.isArray(value)) {
          replacement = `{${value.join(",")}}`;
        } else {
          replacement = JSON.stringify(value);
        }
        text = text.replace(`$${idx + 1}`, replacement);
      });
      const normalized = text.replace(/(\n\s+)/g, " ").trim();
      if (normalized.includes("information_schema.columns")) {
        return {
          rows: [{ exists: 1 }],
          error: undefined,
        };
      }
      runCommands.push(normalized);

      if (normalized.startsWith("SELECT id, email, multi_factor FROM users.users")) {
        return {
          rows: [
            {
              id: "user-123",
              email: "user@example.com",
              multi_factor: MultiFactorMethod.Authenticator,
            },
          ],
          error: undefined,
        };
      }

      if (normalized.startsWith("SELECT id, payload FROM auth.credentials")) {
        const encryptedSecret = encryptAuthenticatorSecret(secret);
        return {
          rows: [
            {
              id: "credential-123",
              payload: {
                secret_encrypted: encryptedSecret,
              },
            },
          ],
          error: undefined,
        };
      }

      if (normalized.startsWith("DELETE FROM auth.verification_tokens")) {
        return {
          rows: [],
          error: undefined,
        };
      }

      if (normalized.startsWith("DELETE FROM auth.credentials")) {
        return {
          rows: [],
          error: undefined,
        };
      }

      if (normalized.startsWith("UPDATE users.users")) {
        return {
          rows: [
            {
              id: "user-123",
            },
          ],
          error: undefined,
        };
      }

      return { rows: [], error: undefined };
    });

    const req = {
      url: "http://localhost/v2/databases/db/auth/mfa",
      headers: new Headers(),
      async json() {
        return { code, requireCode: true };
      },
    };

    const response = await DELETE(req as NextRequest);
    expect(response.status).toBe(200);
    const body = await response.clone().json();
    expect(body).toEqual({
      ok: true,
      method: MultiFactorMethod.Authenticator,
    });

    expect(runCommands).toEqual([
      expect.stringContaining(
        "SELECT id, email, multi_factor FROM users.users WHERE id = user-123",
      ),
      expect.stringContaining("SELECT id, payload FROM auth.credentials"),
      expect.stringContaining(
        "DELETE FROM auth.verification_tokens WHERE ( identifier LIKE mfa:challenge:% OR identifier LIKE mfa:setup:% ) AND token::jsonb ->> 'userId' = user-123",
      ),
      expect.stringContaining(
        "DELETE FROM auth.credentials WHERE user_id = user-123 AND method = MFA",
      ),
      expect.stringContaining(
        "UPDATE users.users SET multi_factor = NULL WHERE id = user-123",
      ),
    ]);
  });

  it("returns 401 when authenticator code is invalid", async () => {
    const runCommands: string[] = [];
    const secret = authenticator.generateSecret();

    auth.mockResolvedValueOnce([
      { user: { id: "user-456", email: "user@example.com" } },
    ]);

    queryBySingle.mockReturnValueOnce(async function sql(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) {
      const rawValues = [...values];
      let text = strings[0] ?? "";
      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }
      rawValues.forEach((value, idx) => {
        let replacement: string;
        if (typeof value === "string") {
          replacement = value;
        } else if (value instanceof Date) {
          replacement = value.toISOString();
        } else {
          replacement = JSON.stringify(value);
        }
        text = text.replace(`$${idx + 1}`, replacement);
      });
      const normalized = text.replace(/(\n\s+)/g, " ").trim();
      if (normalized.includes("information_schema.columns")) {
        return {
          rows: [{ exists: 1 }],
          error: undefined,
        };
      }
      runCommands.push(normalized);

      if (normalized.startsWith("SELECT id, email, multi_factor FROM users.users")) {
        return {
          rows: [
            {
              id: "user-456",
              email: "user@example.com",
              multi_factor: MultiFactorMethod.Authenticator,
            },
          ],
          error: undefined,
        };
      }

      if (normalized.startsWith("SELECT id, payload FROM auth.credentials")) {
        const encryptedSecret = encryptAuthenticatorSecret(secret);
        return {
          rows: [
            {
              id: "credential-456",
              payload: {
                secret_encrypted: encryptedSecret,
              },
            },
          ],
          error: undefined,
        };
      }

      return { rows: [], error: undefined };
    });

    const req = {
      url: "http://localhost/v2/databases/db/auth/mfa",
      headers: new Headers(),
      async json() {
        return { code: "000000", requireCode: true };
      },
    };

    const response = await DELETE(req as NextRequest);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Invalid MFA code");

    expect(runCommands).toEqual([
      expect.stringContaining(
        "SELECT id, email, multi_factor FROM users.users WHERE id = user-456",
      ),
      expect.stringContaining("SELECT id, payload FROM auth.credentials"),
    ]);
  });

  it("disables authenticator MFA when a recovery code is provided", async () => {
    const runCommands: string[] = [];
    const secret = authenticator.generateSecret();
    const recoveryCode = "ABCD-EFGH-IJKL-MNOP-QRST";
    const hashedRecoveryCode = await bcrypt.hash(recoveryCode, 8);

    auth.mockResolvedValueOnce([
      { user: { id: "user-321", email: "recovery@example.com" } },
    ]);

    queryBySingle.mockReturnValueOnce(async function sql(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) {
      const rawValues = [...values];
      let text = strings[0] ?? "";
      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }
      rawValues.forEach((value, idx) => {
        let replacement: string;
        if (typeof value === "string") {
          replacement = value;
        } else if (value instanceof Date) {
          replacement = value.toISOString();
        } else if (Array.isArray(value)) {
          replacement = `{${value.join(",")}}`;
        } else {
          replacement = JSON.stringify(value);
        }
        text = text.replace(`$${idx + 1}`, replacement);
      });
      const normalized = text.replace(/(\n\s+)/g, " ").trim();
      if (normalized.includes("information_schema.columns")) {
        return {
          rows: [{ exists: 1 }],
          error: undefined,
        };
      }
      runCommands.push(normalized);

      if (normalized.startsWith("SELECT id, email, multi_factor FROM users.users")) {
        return {
          rows: [
            {
              id: "user-321",
              email: "recovery@example.com",
              multi_factor: MultiFactorMethod.Authenticator,
            },
          ],
          error: undefined,
        };
      }

      if (normalized.startsWith("SELECT id, payload FROM auth.credentials")) {
        const encryptedSecret = encryptAuthenticatorSecret(secret);
        return {
          rows: [
            {
              id: "credential-321",
              payload: {
                secret_encrypted: encryptedSecret,
                recovery_codes: [
                  { crypt: "crypt-bf/8", hash: hashedRecoveryCode },
                ],
              },
            },
          ],
          error: undefined,
        };
      }

      if (normalized.startsWith("DELETE FROM auth.verification_tokens")) {
        return {
          rows: [],
          error: undefined,
        };
      }

      if (normalized.startsWith("DELETE FROM auth.credentials")) {
        return {
          rows: [],
          error: undefined,
        };
      }

      if (normalized.startsWith("UPDATE users.users")) {
        return {
          rows: [
            {
              id: "user-321",
            },
          ],
          error: undefined,
        };
      }

      return { rows: [], error: undefined };
    });

    const req = {
      url: "http://localhost/v2/databases/db/auth/mfa",
      headers: new Headers(),
      async json() {
        return { code: "abcd efgh ijkl mnop qrst", requireCode: true };
      },
    };

    const response = await DELETE(req as NextRequest);
    expect(response.status).toBe(200);
    const body = await response.clone().json();
    expect(body).toEqual({
      ok: true,
      method: MultiFactorMethod.Authenticator,
      recoveryCodesRemaining: 0,
    });

    expect(runCommands).toEqual([
      expect.stringContaining(
        "SELECT id, email, multi_factor FROM users.users WHERE id = user-321",
      ),
      expect.stringContaining("SELECT id, payload FROM auth.credentials"),
      expect.stringContaining(
        "UPDATE auth.credentials SET payload = jsonb_set(",
      ),
      expect.stringContaining(
        "DELETE FROM auth.verification_tokens WHERE ( identifier LIKE mfa:challenge:% OR identifier LIKE mfa:setup:% ) AND token::jsonb ->> 'userId' = user-321",
      ),
      expect.stringContaining(
        "DELETE FROM auth.credentials WHERE user_id = user-321 AND method = MFA",
      ),
      expect.stringContaining(
        "UPDATE users.users SET multi_factor = NULL WHERE id = user-321",
      ),
    ]);
  });

  it("disables email MFA when challenge token and code are valid", async () => {
    const runCommands: string[] = [];
    const otp = "654321";
    const hashedOtp = await createHash(`${otp}${process.env.NEXTAUTH_SECRET}`);

    auth.mockResolvedValueOnce([
      { user: { id: "user-789", email: "user@example.com" } },
    ]);

    queryBySingle.mockReturnValueOnce(async function sql(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) {
      const rawValues = [...values];
      let text = strings[0] ?? "";
      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }
      rawValues.forEach((value, idx) => {
        let replacement: string;
        if (typeof value === "string") {
          replacement = value;
        } else if (value instanceof Date) {
          replacement = value.toISOString();
        } else {
          replacement = JSON.stringify(value);
        }
        text = text.replace(`$${idx + 1}`, replacement);
      });
      const normalized = text.replace(/(\n\s+)/g, " ").trim();
      if (normalized.includes("information_schema.columns")) {
        return {
          rows: [{ exists: 1 }],
          error: undefined,
        };
      }
      runCommands.push(normalized);

      if (normalized.startsWith("SELECT id, email, multi_factor FROM users.users")) {
        return {
          rows: [
            {
              id: "user-789",
              email: "user@example.com",
              multi_factor: MultiFactorMethod.Email,
            },
          ],
          error: undefined,
        };
      }

      if (
        normalized.startsWith(
          "SELECT identifier, token, expires FROM auth.verification_tokens",
        )
      ) {
        return {
          rows: [
            {
              identifier: "mfa:challenge:disable-token",
              token: JSON.stringify({
                userId: "user-789",
                method: MultiFactorMethod.Email,
                otp: hashedOtp,
              }),
              expires: new Date(Date.now() + 120_000).toISOString(),
            },
          ],
          error: undefined,
        };
      }

      if (normalized.startsWith("DELETE FROM auth.verification_tokens")) {
        return {
          rows: [],
          error: undefined,
        };
      }

      if (normalized.startsWith("DELETE FROM auth.credentials")) {
        return {
          rows: [],
          error: undefined,
        };
      }

      if (normalized.startsWith("UPDATE users.users")) {
        return {
          rows: [
            {
              id: "user-789",
            },
          ],
          error: undefined,
        };
      }

      return { rows: [], error: undefined };
    });

    const req = {
      url: "http://localhost/v2/databases/db/auth/mfa",
      headers: new Headers(),
      async json() {
        return {
          code: otp,
          token: "disable-token",
          scope: ChallengeScope.Challenge,
          method: MultiFactorMethod.Email,
          requireCode: true,
        };
      },
    };

    const response = await DELETE(req as NextRequest);
    expect(response.status).toBe(200);
    const body = await response.clone().json();
    expect(body).toEqual({
      ok: true,
      method: MultiFactorMethod.Email,
    });

    expect(runCommands).toEqual([
      expect.stringContaining(
        "SELECT id, email, multi_factor FROM users.users WHERE id = user-789",
      ),
      expect.stringContaining(
        "SELECT identifier, token, expires FROM auth.verification_tokens WHERE identifier = mfa:challenge:disable-token",
      ),
      expect.stringContaining(
        "DELETE FROM auth.verification_tokens WHERE ( identifier LIKE mfa:challenge:% OR identifier LIKE mfa:setup:% ) AND token::jsonb ->> 'userId' = user-789",
      ),
      expect.stringContaining(
        "DELETE FROM auth.credentials WHERE user_id = user-789 AND method = MFA",
      ),
      expect.stringContaining(
        "UPDATE users.users SET multi_factor = NULL WHERE id = user-789",
      ),
    ]);
  });
});
