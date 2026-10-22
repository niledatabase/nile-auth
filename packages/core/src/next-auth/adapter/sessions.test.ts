jest.mock("@nile-auth/query", () => ({ query: jest.fn() }));

import { Pool } from "pg";
import { encode } from "next-auth/jwt";
import { query } from "@nile-auth/query";
import { getSessionAndUser } from "./getSessionAndUser";
import { deleteSession } from "./deleteSession";
import { updateSession } from "./updateSession";
import { getJwtSession } from "../jwtSession";

const pool = {} as Pool;
const sql = jest.fn();
const row = {
  session_token: "session-key",
  user_id: "user-id",
  expires_at: new Date(Date.now() + 60_000),
  id: "user-id",
  email: "live@example.com",
  name: "Current name",
  email_verified: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "session-test-secret";
  (query as jest.Mock).mockReturnValue(sql);
  sql.mockResolvedValue({ rowCount: 1, rows: [row] });
});

async function cookie(claims = {}) {
  return encode({
    token: {
      id: "user-id",
      email: "stale@example.com",
      sid: "session-key",
      ...claims,
    },
    secret: process.env.NEXTAUTH_SECRET!,
  });
}

it("uses the stored session and current user profile for JWT session lookups", async () => {
  const active = await getSessionAndUser(pool)(await cookie());
  expect(active?.session.sessionToken).toBe("session-key");
  expect(active?.user.email).toBe("live@example.com");
  expect(active?.user.name).toBe("Current name");
});

it("rejects a revoked JWT instead of falling back to an opaque session", async () => {
  sql.mockResolvedValue({ rowCount: 0, rows: [] });
  expect(await getSessionAndUser(pool)(await cookie())).toBeNull();
  expect(sql).toHaveBeenCalledTimes(1);
});

it.each([
  { id: "user-id", exp: Date.now() / 1000 + 60 },
  { id: "user-id", sid: "session-key", exp: Date.now() / 1000 - 60 },
  { id: "user-id", sid: "session-key", exp: NaN },
  { sid: "session-key", exp: Date.now() / 1000 + 60 },
])(
  "rejects incomplete or expired session claims before querying",
  async (token) => {
    expect(await getJwtSession(pool, token)).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  },
);

it("fails closed when session storage returns no result", async () => {
  sql.mockResolvedValue(undefined);
  expect(await getSessionAndUser(pool)(await cookie())).toBeNull();
});

it("keeps opaque OAuth and email sessions working", async () => {
  const active = await getSessionAndUser(pool)("opaque-session");
  expect(active?.user.id).toBe("user-id");
  expect(sql).toHaveBeenCalledTimes(2);
});

it("revokes a JWT cookie by its stable session key", async () => {
  await deleteSession(pool)(await cookie());
  expect(sql.mock.calls[0]?.slice(1)).toEqual(["session-key"]);
});

it("revokes opaque sessions by their original token", async () => {
  await deleteSession(pool)("opaque-session");
  expect(sql.mock.calls[0]?.slice(1)).toEqual(["opaque-session"]);
});

it("reports failed revocation storage", async () => {
  sql.mockResolvedValue(undefined);
  await expect(deleteSession(pool)(await cookie())).rejects.toThrow(
    "Unable to revoke",
  );
});

it("renews a JWT database session using the stable key", async () => {
  const expires = new Date(Date.now() + 120_000);
  const active = await updateSession(pool)({
    sessionToken: await cookie(),
    expires,
  });
  expect(active?.sessionToken).toBe("session-key");
  expect(sql.mock.calls[1]?.slice(1)).toEqual([expires, "session-key"]);
});
