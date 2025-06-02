import { NextRequest } from "next/server";

import { auth } from "../../../../../../../../../packages/core/src/auth";
import { queryByReq } from "@nile-auth/query";

import { GET } from "./route";
import { handleFailure } from "@nile-auth/query/utils";

jest.mock("../../../../../../../../../packages/query/src/query", () => ({
  queryByReq: jest.fn(),
}));
jest.mock("../../../../../../../../../packages/query/src/utils", () => ({
  handleFailure: jest.fn(),
}));
jest.mock("../../../../../../../../../packages/core/src/auth", () => ({
  auth: jest.fn(),
}));

describe("list invites", () => {
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
      if (text.includes("invites")) {
        return [{ code: "28000", name: "failure" }, null];
      }
    });
    (auth as jest.Mock).mockReturnValueOnce([
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
    await GET(req as NextRequest, {
      params: { tenantId: "019073f4-75a6-72b9-a379-5ed38ca0d01a" },
    });
    expect(handleFailure).toHaveBeenCalled();
    expect(commands).toEqual([
      ":SET LOCAL nile.tenant_id = '019073f4-75a6-72b9-a379-5ed38ca0d01a'; :SET LOCAL nile.user_id = 'some-uuid'; SELECT * FROM auth.invites;",
    ]);
  });
  it("allows a user to update a tenant they are in", async () => {
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
      if (text.includes("invites")) {
        return [null, null, { rowCount: 1, rows: [{ name: "one" }] }];
      }
    });
    (auth as jest.Mock).mockReturnValueOnce([
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
    const res = await GET(req as NextRequest, {
      params: { tenantId: "019073f4-75a6-72b9-a379-5ed38ca0d01a" },
    });
    expect(res?.status).toEqual(200);
    expect(runCommands).toEqual([
      ":SET LOCAL nile.tenant_id = '019073f4-75a6-72b9-a379-5ed38ca0d01a'; :SET LOCAL nile.user_id = 'some-uuid'; SELECT * FROM auth.invites;",
    ]);
  });
});
