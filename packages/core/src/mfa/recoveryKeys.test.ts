jest.mock("./authenticatorSecret", () => ({
  encryptAuthenticatorSecret: jest.fn(),
}));

jest.mock("../utils", () => ({
  randomString: jest.fn(),
}));

import bcrypt from "bcryptjs";

import {
  storeAuthenticatorSecret,
  normalizeRecoveryCode,
  consumeRecoveryCode,
  StoredRecoveryCode,
} from "./recoveryKeys";
import { encryptAuthenticatorSecret } from "./authenticatorSecret";
import { randomString } from "../utils";
import { ProviderMethods } from "../types";
import { DEFAULT_ISSUER } from "./constants";

const encryptAuthenticatorSecretMock =
  encryptAuthenticatorSecret as jest.MockedFunction<
    typeof encryptAuthenticatorSecret
  >;
const randomStringMock = randomString as jest.MockedFunction<
  typeof randomString
>;

describe("mfa/recoveryKeys", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    encryptAuthenticatorSecretMock.mockReturnValue("encrypted-secret");
  });

  it("stores encrypted secrets and returns unique formatted recovery keys", async () => {
    const sequence = [
      "abcd123456",
      "abcd123456",
      "efgh789012",
      "ijkl345678",
      "mnop901234",
      "qrst567890",
      "uvwx123456",
      "uvwx123456",
      "yzab789012",
      "cdef345678",
    ];
    randomStringMock.mockImplementation(() => sequence.shift() ?? "zzzz999999");

    const sqlCalls: string[] = [];
    const sqlMock = jest.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        sqlCalls.push(strings.join(" "));
        return { rows: [] };
      },
    );

    const keys = await storeAuthenticatorSecret({
      sql: sqlMock as any,
      userId: "user-id",
      secret: "secret-value",
      email: "user@example.com",
      issuer: "   ",
    });

    expect(keys).toHaveLength(7);
    keys.forEach((key) => {
      expect(key).toMatch(/^[A-Z0-9-]+$/);
      key.split("-").forEach((segment) => {
        expect(segment.length).toBeGreaterThanOrEqual(2);
        expect(segment.length).toBeLessThanOrEqual(4);
      });
    });
    expect(new Set(keys).size).toBe(keys.length);

    expect(sqlCalls[0]).toContain("DELETE FROM auth.credentials");
    expect(sqlCalls[1]).toContain("INSERT INTO");
    expect(sqlMock.mock.calls?.[1]?.[2]).toBe(ProviderMethods.MFA);

    expect(sqlMock.mock.calls?.[1]?.[3]).toBe("encrypted-secret");
    expect(sqlMock.mock.calls?.[1]?.[4]).toBe(DEFAULT_ISSUER);
    expect(sqlMock.mock.calls?.[1]?.[5]).toEqual(keys);

    expect(encryptAuthenticatorSecretMock).toHaveBeenCalledWith("secret-value");
    expect(randomStringMock).toHaveBeenCalled();
  });

  it("normalizes recovery codes regardless of spacing or casing", () => {
    expect(normalizeRecoveryCode("abcd efgh ijkl mnop qrst")).toBe(
      "ABCD-EFGH-IJKL-MNOP-QRST",
    );
    expect(normalizeRecoveryCode("123456")).toBe("1234-56");
    expect(normalizeRecoveryCode("")).toBe("");
  });

  it("consumes stored recovery codes and reports remaining", async () => {
    const hash = await bcrypt.hash("ABCD-EFGH-IJKL-MNOP-QRST", 8);
    const recoveryCodes: StoredRecoveryCode[] = [
      { crypt: "crypt-bf/8", hash },
      { crypt: "crypt-bf/8", hash: null },
    ];

    await expect(
      consumeRecoveryCode({
        code: "abcd efgh ijkl mnop qrst",
        recoveryCodes,
      }),
    ).resolves.toEqual({
      consumed: true,
      remainingCodes: [recoveryCodes[1]],
    });

    await expect(
      consumeRecoveryCode({
        code: "wrong-code",
        recoveryCodes,
      }),
    ).resolves.toEqual({
      consumed: false,
      remainingCodes: recoveryCodes,
    });

    await expect(
      consumeRecoveryCode({
        code: "",
        recoveryCodes,
      }),
    ).resolves.toEqual({
      consumed: false,
      remainingCodes: recoveryCodes,
    });
  });
});
