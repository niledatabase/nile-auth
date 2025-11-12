import { NextRequest } from "next/server";

import { auth } from "../../../../../../../../../packages/core/src/auth";
import { queryByReq, raw } from "@nile-auth/query";

import { GET } from "./route";

jest.mock(
  "../../../../../../../../../packages/query/src/multiFactorColumn",
  () => {
    const actual = jest.requireActual(
      "../../../../../../../../../packages/query/src/multiFactorColumn",
    );
    return {
      ...actual,
      multiFactorColumn: jest.fn(),
    };
  },
);
const { multiFactorColumn: mockMultiFactorColumn } = jest.requireMock(
  "../../../../../../../../../packages/query/src/multiFactorColumn",
) as { multiFactorColumn: jest.Mock };

jest.mock("../../../../../../../../../packages/query/src/query", () => {
  const actual = jest.requireActual(
    "../../../../../../../../../packages/query/src/query",
  );
  return {
    ...actual,
    handleFailure: jest.fn(),
    queryByReq: jest.fn(),
  };
});
jest.mock("../../../../../../../../../packages/core/src/auth", () => ({
  auth: jest.fn(),
}));

const users = [
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
  {
    id: "0190b7cb-d6f7-7f97-a08b-b1c383efcdd0",
    created: "2024-07-15T23:08:27.764Z",
    updated: "2024-07-15T23:08:27.764Z",
    deleted: null,
    name: null,
    familyName: null,
    givenName: null,
    email: "dyedsdsdd@yes.com",
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

describe("list tenant users", () => {
  it("404s if the user is not in the tenant", async () => {
    mockMultiFactorColumn.mockResolvedValue(
      raw('multi_factor AS "multiFactor"'),
    );
    const runCommands: string[] = [];
    // @ts-expect-error - test
    auth.mockReturnValueOnce([
      {
        user: {
          id: "some-uuid",
        },
      },
    ]);

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
        const normalized =
          val && typeof val === "object" && "value" in (val as Record<string, any>)
            ? (val as { value: string }).value
            : val;
        text = text.replace(`$${idx + 1}`, normalized as string);
      });
      text = text.replace(/(\n\s+)/g, " ").trim();

      if (text.includes("information_schema.columns")) {
        return [{ rowCount: 1, rows: [{ exists: 1 }] }];
      }
      runCommands.push(text);
      if (text.includes("users.users")) {
        return [
          null,
          {
            code: "22023",
            name: "error",
            message: `message: 'tenant "019345a1-58a8-7473-8433-4a32131ffde3" not found'`,
          },
        ];
      }
    });

    const req = {
      url: "http://localhost",
    };
    const res = await GET(req as NextRequest, {
      params: { tenantId: "tenantId" },
    });
    expect(res.status).toEqual(404);
    expect(runCommands).toEqual([
      ':SET LOCAL nile.tenant_id = \'tenantId\'; :SET LOCAL nile.user_id = \'some-uuid\'; SELECT id, u.email, name, family_name AS "familyName", given_name AS "givenName", picture, email_verified AS "emailVerified", multi_factor AS "multiFactor" FROM users.users u JOIN users.tenant_users tu ON u.id = tu.user_id WHERE u.deleted IS NULL AND tu.deleted IS NULL',
    ]);
  });
  it("returns a list of tenant users", async () => {
    mockMultiFactorColumn.mockResolvedValue(
      raw('multi_factor AS "multiFactor"'),
    );
    const runCommands: string[] = [];
    // @ts-expect-error - test
    auth.mockReturnValueOnce([
      {
        user: {
          id: "some-uuid",
        },
      },
    ]);

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
        const normalized =
          val && typeof val === "object" && "value" in (val as Record<string, any>)
            ? (val as { value: string }).value
            : val;
        text = text.replace(`$${idx + 1}`, normalized as string);
      });
      text = text.replace(/(\n\s+)/g, " ").trim();
      if (text.includes("information_schema.columns")) {
        return [{ rowCount: 1, rows: [{ exists: 1 }] }];
      }
      runCommands.push(text);
      if (text.includes("users.users")) {
        return [
          null,
          null,
          {
            rows: users,
            rowCount: 2,
          },
        ];
      }
    });

    const req = {
      url: "http://localhost",
    };
    const res = await GET(req as NextRequest, {
      params: { tenantId: "tenantId" },
    });
    const json = await new Response(res.body).json();
    expect(runCommands).toEqual([
      ':SET LOCAL nile.tenant_id = \'tenantId\'; :SET LOCAL nile.user_id = \'some-uuid\'; SELECT id, u.email, name, family_name AS "familyName", given_name AS "givenName", picture, email_verified AS "emailVerified", multi_factor AS "multiFactor" FROM users.users u JOIN users.tenant_users tu ON u.id = tu.user_id WHERE u.deleted IS NULL AND tu.deleted IS NULL',
    ]);
    expect(json).toEqual(users);
  });
});
