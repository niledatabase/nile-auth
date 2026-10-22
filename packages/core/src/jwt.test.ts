jest.mock("pg", () => ({ Pool: jest.fn() }));
jest.mock("@nile-auth/query", () => ({ query: jest.fn() }));
jest.mock("./next-auth/adapter", () => ({
  __esModule: true,
  default: () => ({ deleteSession: jest.fn() }),
}));

import { Pool } from "pg";
import { query } from "@nile-auth/query";
import { decode, encode } from "next-auth/jwt";
import { buildOptions, jwt } from "./utils";

const dbInfo = {
  user: "user",
  password: "password",
  host: "localhost",
  port: 5432,
  database: "test",
};
const sql = jest.fn();
const end = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (Pool as unknown as jest.Mock).mockReturnValue({ end });
  (query as jest.Mock).mockReturnValue(sql);
  sql.mockResolvedValue({ rowCount: 1 });
});

it("persists the initial credentials session before NextAuth adds exp and jti", async () => {
  const token = await jwt({
    token: {},
    user: { id: "user-id", email: "user@example.com" },
    account: null,
    dbInfo,
  });
  expect(token.sid).toEqual(expect.any(String));
  expect(token.exp).toBeGreaterThan(Date.now() / 1000);
  expect(sql.mock.calls[0]?.slice(1)).toEqual([
    "user-id",
    expect.any(Date),
    token.sid,
  ]);
  const first = await decode({
    token: await encode({ token, secret: "test" }),
    secret: "test",
  });
  const second = await decode({
    token: await encode({ token: first!, secret: "test" }),
    secret: "test",
  });
  expect(first?.sid).toBe(token.sid);
  expect(second?.sid).toBe(token.sid);
  expect(first?.jti).not.toBe(second?.jti);
  expect(end).toHaveBeenCalledTimes(1);
});

it("renews the stored session without inserting a revoked session again", async () => {
  sql.mockResolvedValue({ rowCount: 0 });
  await expect(
    jwt({
      token: { id: "user-id", sid: "revoked-session" },
      user: undefined as any,
      account: null,
      dbInfo,
    }),
  ).rejects.toThrow("revoked");
  expect(sql.mock.calls[0]?.[0].join(" ")).toMatch(/UPDATE auth.sessions/);
  expect(sql.mock.calls[0]?.[0].join(" ")).not.toMatch(/INSERT/);
  expect(end).toHaveBeenCalledTimes(1);
});

it("refuses to issue a token when storing its session fails", async () => {
  sql.mockResolvedValue(undefined);
  await expect(
    jwt({ token: {}, user: { id: "user-id" }, account: null, dbInfo }),
  ).rejects.toThrow("could not be saved");
  expect(end).toHaveBeenCalledTimes(1);
});

it("does not silently register an older JWT during a refresh", async () => {
  await expect(
    jwt({
      token: { id: "user-id", jti: "old-jti" },
      user: undefined as any,
      account: null,
      dbInfo,
    }),
  ).rejects.toThrow("missing");
  expect(sql).not.toHaveBeenCalled();
});

it("revokes JWT-strategy sessions and preserves the configured sign-out callback", async () => {
  const signOut = jest.fn();
  const options = buildOptions(
    new Request("https://example.com/v2/databases/test/auth/signout"),
    {
      ...dbInfo,
      providers: [],
      events: { signOut },
    },
  );
  const message = { token: { sid: "session-key" } };
  await options.events?.signOut?.(message);
  expect(options.adapter?.deleteSession).toHaveBeenCalledWith("session-key");
  expect(signOut).toHaveBeenCalledWith(message);
});
