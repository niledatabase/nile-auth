import { NextRequest } from "next/server";

import { auth } from "../../../../../../../../packages/core/src/auth";
import { queryByReq } from "@nile-auth/query";

import { PUT } from "./route";

jest.mock("../../../../../../../../packages/query/src/query", () => ({
  handleFailure: jest.fn(),
  queryByReq: jest.fn(),
}));
jest.mock("../../../../../../../../packages/core/src/auth", () => ({
  auth: jest.fn(),
}));

const tenant = [
  {
    id: "019073f4-75a6-72b9-a379-5ed38ca0d01a",
    created: "2024-07-15T23:10:09.971Z",
    updated: "2024-07-15T23:10:09.971Z",
    deleted: null,
    name: "foo",
  },
];

describe("update tenants", () => {
  it("404s if the user is not in the tenant", async () => {
    const commands: string[] = [];
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
      commands.push(text);
      if (text.includes("tenants")) {
        return [
          null,
          null,
          {
            rows: tenant,
            rowCount: 0,
          },
        ];
      }
      if (text.includes("users.tenant_users")) {
        return [
          null,
          null,
          {
            rows: [{ count: 1 }],
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
        return { name: "garbage" };
      },
    };
    const res = await PUT(req as NextRequest, {
      params: { tenantId: "019073f4-75a6-72b9-a379-5ed38ca0d01a" },
    });
    expect(res?.status).toEqual(404);
    expect(commands).toEqual([
      ":SET nile.tenant_id = '019073f4-75a6-72b9-a379-5ed38ca0d01a'; :SET nile.user_id = 'some-uuid'; SELECT COUNT(*) FROM users.tenant_users WHERE deleted IS NULL",
      "UPDATE tenants SET name = garbage WHERE id = 019073f4-75a6-72b9-a379-5ed38ca0d01a RETURNING *;",
    ]);
  });
  fit("allows a user to update a tenant they are in", async () => {
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
      if (text.includes("tenants")) {
        return [
          {
            rows: tenant,
            rowCount: 1,
          },
        ];
      }
      if (text.includes("users.tenant_users")) {
        return [
          null,
          null,
          {
            rows: [{ count: 1 }],
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
        return { name: "garbage" };
      },
    };
    const res = await PUT(req as NextRequest, {
      params: { tenantId: "019073f4-75a6-72b9-a379-5ed38ca0d01a" },
    });
    expect(res?.status).toEqual(200);
    expect(runCommands).toEqual([
      ":SET nile.tenant_id = '019073f4-75a6-72b9-a379-5ed38ca0d01a'; :SET nile.user_id = 'some-uuid'; SELECT COUNT(*) FROM users.tenant_users WHERE deleted IS NULL",
      "UPDATE tenants SET name = garbage WHERE id = 019073f4-75a6-72b9-a379-5ed38ca0d01a RETURNING *;",
    ]);
  });
});
