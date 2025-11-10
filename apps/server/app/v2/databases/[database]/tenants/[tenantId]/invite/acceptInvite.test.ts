import { NextRequest } from "next/server";

import { auth } from "../../../../../../../../../packages/core/src/auth";
import { queryBySingle, queryByReq } from "@nile-auth/query";
import { PUT } from "./route";

jest.mock("../../../../../../../../../packages/query/src/query", () => ({
  queryBySingle: jest.fn(),
  queryByReq: jest.fn(),
}));
const mockResponder = jest.fn();
const mockReporter = { error: jest.fn() };
jest.mock("../../../../../../../../../packages/core/src/auth", () => ({
  auth: jest.fn(),
}));
jest.mock(
  "../../../../../../../../../packages/logger/src/ResponseLogger",
  () => {
    return {
      ResponseLogger: jest.fn(() => [mockResponder, mockReporter]),
    };
  },
);

describe("accept invite", () => {
  const commands: string[] = [];
  it("successfully creates a user from a valid invite", async () => {
    const sql = async (strings: TemplateStringsArray, ...values: any[]) => {
      let text = strings[0] ?? "";

      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }

      values.forEach((val, idx) => {
        text = text.replace(`$${idx + 1}`, val);
      });

      text = text.replace(/(\n\s+)/g, " ").trim();
      commands.push(text);

      if (text.includes("FROM auth.invites")) {
        return {
          rows: [
            {
              id: "invite-id",
              created_by: "creator-uuid",
              expires: new Date(Date.now() + 100000).toISOString(),
            },
          ],
          error: null,
        };
      }

      if (text.includes("FROM users.tenant_users")) {
        return {
          rows: [{ user_id: "creator-uuid" }],
          error: null,
        };
      }

      if (text.includes("INSERT INTO users.users")) {
        return {
          rows: [
            {
              id: "new-user-id",
              email: "user@example.com",
              name: null,
              familyName: null,
              givenName: null,
              picture: null,
              created: new Date().toISOString(),
              updated: new Date().toISOString(),
              emailVerified: new Date().toISOString(),
            },
          ],
          error: null,
        };
      }

      if (text.includes("DELETE FROM auth.invites")) {
        return { rows: [], error: null };
      }

      return { rows: [], error: null };
    };
    const sqlAgain = async function sqlAgain(
      strings: TemplateStringsArray,
      ...values: any[]
    ) {
      let text = strings[0] ?? "";
      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }
      values.forEach((val, i) => {
        text = text.replace(`$${i + 1}`, val);
      });
      text = text.replace(/\n\s+/g, " ").trim();
      commands.push(text);

      if (text.includes("DELETE")) {
        console.log(text, "not here?");
        return [null, { rowCount: 1 }];
      }

      if (text.includes("auth.invites")) {
        return [
          null,
          {
            rows: [{ id: "user-uuid", created_by: "123" }],
          },
        ];
      }
    };
    (queryBySingle as jest.Mock).mockReturnValue(sql);
    (queryByReq as jest.Mock).mockReturnValue(sqlAgain);

    (auth as jest.Mock).mockReturnValue([
      {
        user: { id: "accepting-user" },
      },
    ]);

    const req = {
      url: "http://localhost",
      async formData() {
        const fd = new FormData();
        fd.set("identifier", "user@example.com");
        fd.set("token", "valid-token");
        fd.set("callbackUrl", "http://localhost:3000");
        return fd;
      },
    };

    await PUT(req as NextRequest, {
      params: { tenantId: "019073f4-75a6-72b9-a379-5ed38ca0d01a" },
    });

    expect(mockResponder).toHaveBeenCalledWith(null, {
      headers: { location: "http://localhost:3000/" },
      status: 204,
    });

    expect(commands).toEqual([
      ":SET LOCAL nile.tenant_id = '019073f4-75a6-72b9-a379-5ed38ca0d01a'; SELECT * FROM auth.invites WHERE identifier = user@example.com AND token = valid-token",
      ":SET LOCAL nile.tenant_id = '019073f4-75a6-72b9-a379-5ed38ca0d01a'; DELETE FROM auth.invites WHERE id = user-uuid",
      "SELECT * FROM users.tenant_users WHERE user_id = 123 AND tenant_id = 019073f4-75a6-72b9-a379-5ed38ca0d01a",
      expect.stringMatching(
        /^INSERT INTO users\.users \(email, email_verified\) VALUES \( user@example\.com, CURRENT_TIMESTAMP \) RETURNING id, email, name, family_name AS "familyName", given_name AS "givenName", picture, created, updated, email_verified AS "emailVerified", multi_factor AS "multiFactor"$/,
      ),
      "UPDATE users.users SET email_verified = CURRENT_TIMESTAMP WHERE email = user@example.com AND deleted IS NULL",
      "INSERT INTO users.tenant_users (tenant_id, user_id, email) VALUES ( 019073f4-75a6-72b9-a379-5ed38ca0d01a, new-user-id, user@example.com ) RETURNING *",
    ]);
  });
});
