import { createHmac } from "node:crypto";

jest.mock("@nile-auth/logger", () => ({
  Logger: () => ({ warn: jest.fn() }),
}));
jest.mock("./providerResponse", () => ({ getMfaResponse: jest.fn() }));
jest.mock("../next-auth/csrf", () => ({ createHash: jest.fn() }));

import { verifyAuthenticatorToken } from "./index";

// v12 enrolled 10-byte secrets. Compute tokens independently of otplib so the
// upgrade is checked against the original SHA-1 TOTP algorithm.
const secret = "GEZDGNBVGY3TQOJQ";
const epoch = 1_750_000_005;

function tokenAt(time: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30)));
  const digest = createHmac("sha1", "1234567890").update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}

describe("authenticator compatibility", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(epoch * 1_000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([-30, 0, 30])(
    "accepts existing secrets with %i seconds of drift",
    (drift) => {
      expect(
        verifyAuthenticatorToken({ secret, token: tokenAt(epoch + drift) }),
      ).toBe(true);
    },
  );

  it.each([-60, 60])(
    "rejects tokens %i seconds outside the accepted window",
    (drift) => {
      expect(
        verifyAuthenticatorToken({ secret, token: tokenAt(epoch + drift) }),
      ).toBe(false);
    },
  );

  it.each(["", "123", "not-a-code"])(
    'rejects malformed token "%s"',
    (token) => {
      expect(verifyAuthenticatorToken({ secret, token })).toBe(false);
    },
  );
});
