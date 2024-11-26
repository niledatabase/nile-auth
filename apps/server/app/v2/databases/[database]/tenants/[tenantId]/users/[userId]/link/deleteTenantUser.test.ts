import { NextRequest } from "next/server";

import { auth } from "../../../../../../../../../../../packages/core/src/auth";
import { queryByReq, formatTime } from "@nile-auth/query";

import { DELETE } from "./route";

jest.mock("../../../../../../../../../../../packages/query/src/query", () => ({
  handleFailure: jest.fn(),
  queryByReq: jest.fn(),
  formatTime: jest.fn(),
}));
jest.mock("../../../../../../../../../../../packages/core/src/auth", () => ({
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

describe("mark a user deleted", () => {
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

      if (text.includes("users.tenant_users")) {
        return [
          null,
          null,
          {
            rows: tenantUsers,
            rowCount: 0,
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
    await DELETE(req as NextRequest, {
      params: {
        userId: "019073f4-75a6-72b9-a379-5ed38ca0d01a",
        tenantId: "whatever",
      },
    });
    expect(runCommands).toEqual([
      ":SET nile.tenant_id = 'whatever'; :SET nile.user_id = 'some-uuid'; SELECT COUNT(*) FROM users.tenant_users WHERE deleted IS NULL",
      ":SET nile.tenant_id = 'whatever'; :SET nile.user_id = '019073f4-75a6-72b9-a379-5ed38ca0d01a'; UPDATE users.tenant_users SET deleted = undefined WHERE user_id = 019073f4-75a6-72b9-a379-5ed38ca0d01a",
    ]);
  });
  it("deletes a user", async () => {
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
      if (text.includes("users.tenant_users")) {
        return [
          null,
          null,
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
        return { name: "garbage" };
      },
    };
    await DELETE(req as NextRequest, {
      params: {
        userId: "019073f4-75a6-72b9-a379-5ed38ca0d01a",
        tenantId: "whatever",
      },
    });

    expect(runCommands).toEqual([
      ":SET nile.tenant_id = 'whatever'; :SET nile.user_id = 'some-uuid'; SELECT COUNT(*) FROM users.tenant_users WHERE deleted IS NULL",
      ":SET nile.tenant_id = 'whatever'; :SET nile.user_id = '019073f4-75a6-72b9-a379-5ed38ca0d01a'; UPDATE users.tenant_users SET deleted = undefined WHERE user_id = 019073f4-75a6-72b9-a379-5ed38ca0d01a",
    ]);
  });
});
