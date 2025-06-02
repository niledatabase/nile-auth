import { NextRequest } from "next/server";

import { auth } from "../../../../../../../../../packages/core/src/auth";
import { queryBySingle } from "@nile-auth/query";
import { PUT } from "./route";

jest.mock("../../../../../../../../../packages/query/src/query", () => ({
  queryBySingle: jest.fn(),
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
  it("successfully creates a user from a valid invite", async () => {
    const commands: string[] = [];
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

    (queryBySingle as jest.Mock).mockReturnValue(sql);

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
        return fd;
      },
    };

    await PUT(req as NextRequest, {
      params: { tenantId: "019073f4-75a6-72b9-a379-5ed38ca0d01a" },
    });

    expect(mockResponder).toHaveBeenCalledWith(
      expect.stringContaining("user@example.com"),
      { status: 201 },
    );

    expect(commands).toEqual([
      "SELECT * FROM auth.invites WHERE identifier = user@example.com AND token = valid-token",
      "SELECT * FROM users.tenant_users WHERE user_id = creator-uuid AND tenant_id = 019073f4-75a6-72b9-a379-5ed38ca0d01a",
      expect.stringMatching(
        /^INSERT INTO users\.users \(email, email_verified\) VALUES \( user@example\.com, CURRENT_TIMESTAMP \) RETURNING id, email, name, family_name AS "familyName", given_name AS "givenName", picture, created, updated, email_verified AS "emailVerified"$/,
      ),
      "DELETE FROM auth.invites WHERE id = invite-id",
    ]);
  });
});
