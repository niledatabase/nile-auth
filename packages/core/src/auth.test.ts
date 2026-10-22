jest.mock("pg", () => ({ Pool: jest.fn() }));
jest.mock("@nile-auth/query/getDbInfo", () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
}));
jest.mock("./next-auth/jwtSession", () => ({ getJwtSession: jest.fn() }));

import { encode } from "next-auth/jwt";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { getJwtSession } from "./next-auth/jwtSession";
import { auth, buildFetch } from "./auth";

const end = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "auth-test-secret";
  (Pool as unknown as jest.Mock).mockReturnValue({ end });
});

async function request() {
  const token = await encode({
    token: { id: "user-id", sid: "session-key" },
    secret: process.env.NEXTAUTH_SECRET!,
  });
  return new NextRequest("http://localhost/v2/databases/test/me", {
    headers: { cookie: `nile.session-token=${token}` },
  });
}

it("accepts an active database session and closes the revocation-check pool", async () => {
  (getJwtSession as jest.Mock).mockResolvedValue({ user: { id: "user-id" } });
  expect(await auth(await request())).toEqual([{ user: { id: "user-id" } }]);
  expect(end).toHaveBeenCalledTimes(1);
});

it.each([null, "storage-error"])(
  "denies revoked sessions and database failures without an auth fallback (%s)",
  async (result) => {
    if (result)
      (getJwtSession as jest.Mock).mockRejectedValue(new Error(result));
    else (getJwtSession as jest.Mock).mockResolvedValue(null);
    const fetchMock = jest.spyOn(globalThis, "fetch");
    try {
      expect(await auth(await request())).toEqual([{ user: undefined }]);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(end).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  },
);

it("continues to resolve opaque cookies through the session endpoint", async () => {
  const req = new Request("http://localhost/v2/databases/test/me", {
    headers: {
      cookie: "nile.session-token=opaque-session",
      "content-length": "0",
    },
  });
  const [url, headers] = await buildFetch(req);
  expect(String(url)).toBe("http://localhost/v2/databases/test/auth/session");
  expect(headers?.get("cookie")).toBe("nile.session-token=opaque-session");
  expect(headers?.has("content-length")).toBe(false);
});
