import { NextRequest } from "next/server";

import { auth } from "../../../../../../../../../packages/core/src/auth";
import { queryByReq } from "@nile-auth/query";

import { POST } from "./route";

jest.mock("../../../../../../../../../packages/query/src/query", () => ({
  handleFailure: jest.fn(),
  queryByReq: jest.fn(),
}));
jest.mock("../../../../../../../../../packages/core/src/auth", () => ({
  auth: jest.fn(),
}));
const user = [
  {
    id: "0190b7cd-661a-76d4-ba6e-6ae2c383e3c1",
    created: "2024-07-15T23:10:09.945Z",
    updated: "2024-07-15T23:10:09.945Z",
    deleted: null,
    name: null,
    familyName: null,
    givenName: null,
    email: "no@no.com",
    picture: null,
    emailVerified: null,
  },
];

const tenantUsers = [
  {
    tenant_id: "019073f4-75a6-72b9-a379-5ed38ca0d01a",
    user_id: "0190b7cd-661a-76d4-ba6e-6ae2c383e3c1",
    created: "2024-07-15T23:10:09.971Z",
    updated: "2024-07-15T23:10:09.971Z",
    deleted: null,
    roles: null,
    email: "no@no.com",
  },
];

describe("create users", () => {
  it("404s if the user is not in the tenant", async () => {
    const runCommands: string[] = [];
    // @ts-expect-error - test
    queryByReq.mockReturnValueOnce(async function sql(
      strings: TemplateStringsArray,
      ...values: string[]
    ) {
      let text = strings[0] ?? "";

      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }
      values.map((val, idx) => {
        text = text.replace(`$${idx + 1}`, val);
      });
      text = text.replace(/(\n\s+)/g, " ").trim();
      runCommands.push(text);

      if (text.includes("SELECT 1")) {
        return [
          null,
          null,
          {
            rows: [{ count: 0 }],
            rowCount: 1,
          },
        ];
      }
    });
    // @ts-expect-error - test
    auth.mockReturnValueOnce([
      {
        user: {
          id: "some-uuid",
        },
      },
    ]);
    const req = {
      url: "http://localhost",
    };
    const res = await POST(req as NextRequest, {
      params: { tenantId: "tenantId" },
    });
    expect(res.status).toEqual(404);
    expect(runCommands).toEqual([
      ":SET LOCAL nile.tenant_id = 'tenantId'; :SET LOCAL nile.user_id = 'some-uuid'; SELECT 1 FROM users.tenant_users WHERE deleted IS NULL",
    ]);
  });
  it("returns a created user", async () => {
    const runCommands: string[] = [];
    // @ts-expect-error - test
    queryByReq.mockReturnValueOnce(async function sql(
      strings: TemplateStringsArray,
      ...values: string[]
    ) {
      let text = strings[0] ?? "";

      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }
      values.map((val, idx) => {
        text = text.replace(`$${idx + 1}`, val);
      });
      text = text.replace(/(\n\s+)/g, " ").trim();
      runCommands.push(text);

      if (text.includes("auth.credentials")) {
        return [];
      }
      if (text.includes("SELECT 1")) {
        return [
          null,
          null,
          {
            rows: [{ count: 1 }],
            rowCount: 1,
          },
        ];
      }
      if (text.includes("users.users")) {
        return [
          {
            rows: user,
            rowCount: 1,
          },
        ];
      }
      if (text.includes("users.tenant_users")) {
        return [
          {
            rows: tenantUsers,
            rowCount: 1,
          },
        ];
      }
    });
    // @ts-expect-error - test
    auth.mockReturnValueOnce([
      {
        user: {
          id: "some-uuid",
        },
      },
    ]);
    const req = {
      url: "http://localhost",
      async json() {
        return {
          email: "test@test.com",
          password: "password",
          name: "test@test.com",
          familyName: "test@test.com",
          givenName: "test@test.com",
          picture: "test@test.com",
          emailVerified: "some time",
        };
      },
    };
    const res = await POST(req as NextRequest, {
      params: { tenantId: "tenantId" },
    });
    expect(res.status).toEqual(201);
    expect(runCommands).toEqual([
      ":SET LOCAL nile.tenant_id = 'tenantId'; :SET LOCAL nile.user_id = 'some-uuid'; SELECT 1 FROM users.tenant_users WHERE deleted IS NULL",
      'INSERT INTO users.users (email, name, family_name, given_name, picture) VALUES ( test@test.com, test@test.com, test@test.com, test@test.com, test@test.com ) RETURNING id, email, name, family_name AS "familyName", given_name AS "givenName", picture, created, updated, email_verified AS "emailVerified"',
      "INSERT INTO users.tenant_users (tenant_id, user_id, email) VALUES ( tenantId, 0190b7cd-661a-76d4-ba6e-6ae2c383e3c1, test@test.com )",
      "INSERT INTO auth.credentials (user_id, method, provider, payload) VALUES ( 0190b7cd-661a-76d4-ba6e-6ae2c383e3c1, 'EMAIL_PASSWORD', 'nile', jsonb_build_object( 'crypt', 'crypt-bf/8', 'hash', public.crypt ( password, public.gen_salt ('bf', 8) ), 'email', test@test.com::text ) )",
    ]);
  });
});
