import { NextRequest } from "next/server";

import { POST } from "./route";

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
const tenant = [
  {
    id: "019073f4-75a6-72b9-a379-5ed38ca0d01a",
    created: "2024-07-15T23:10:09.971Z",
    updated: "2024-07-15T23:10:09.971Z",
    deleted: null,
    name: "foo",
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

let runCommands: string[] = [];
jest.mock("../../../../../../../packages/query/src/query", () => {
  return {
    handleFailure: jest.fn(),
    queryByReq: async function handler() {
      return async function sql(
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
          return {
            rows: tenant,
            rowCount: 1,
          };
        }
        if (text.includes("users.users")) {
          return {
            rows: user,
            rowCount: 1,
          };
        }
        if (text.includes("users.tenant_users")) {
          return {
            rows: tenantUsers,
          };
        }
      };
    },
  };
});

jest.mock("../../../../../../../packages/core/src/auth", () => ({
  __esModule: true,
  auth: () => [
    {
      user: {
        id: "some-uuid",
      },
    },
  ],
}));

describe("list users", () => {
  beforeEach(() => {
    runCommands = [];
  });
  it("returns a created user", async () => {
    const req = {
      url: "http://localhost",
      async json() {
        return {
          email: "test@test.com",
          name: "test@test.com",
          familyName: "test@test.com",
          givenName: "test@test.com",
          picture: "test@test.com",
        };
      },
    };
    await POST(req as NextRequest);

    expect(runCommands).toEqual([
      'INSERT INTO users.users (email, name, family_name, given_name, picture) VALUES ( test@test.com, test@test.com, test@test.com, test@test.com, test@test.com ) RETURNING id, email, name, family_name AS "familyName", given_name AS "givenName", picture, created, updated;',
    ]);
  });
  it("supports newTenantName", async () => {
    const req = {
      url: "http://localhost?newTenantName=foo",
      async json() {
        return {
          email: "test@test.com",
          name: "test@test.com",
          familyName: "test@test.com",
          givenName: "test@test.com",
          picture: "test@test.com",
          emailVerified: "some time",
        };
      },
    };
    const res = await POST(req as NextRequest);
    const json = await new Response(res.body).json();
    expect(json).toEqual({
      created: "2024-07-15T23:10:09.945Z",
      deleted: null,
      email: "no@no.com",
      emailVerified: null,
      familyName: null,
      givenName: null,
      id: "0190b7cd-661a-76d4-ba6e-6ae2c383e3c1",
      name: null,
      picture: null,
      tenants: ["019073f4-75a6-72b9-a379-5ed38ca0d01a"],
      updated: "2024-07-15T23:10:09.945Z",
    });
    expect(runCommands).toEqual([
      'INSERT INTO users.users (email, name, family_name, given_name, picture) VALUES ( test@test.com, test@test.com, test@test.com, test@test.com, test@test.com ) RETURNING id, email, name, family_name AS "familyName", given_name AS "givenName", picture, created, updated;',
      "INSERT INTO tenants (name) VALUES (foo) RETURNING id;",
      "INSERT INTO users.tenant_users (tenant_id, user_id, email) VALUES ( 019073f4-75a6-72b9-a379-5ed38ca0d01a, 0190b7cd-661a-76d4-ba6e-6ae2c383e3c1, test@test.com )",
    ]);
  });
  it("supports tenantId", async () => {
    const req = {
      url: "http://localhost?tenantId=12345",
      async json() {
        return {
          email: "test@test.com",
          name: "test@test.com",
          familyName: "test@test.com",
          givenName: "test@test.com",
          picture: "test@test.com",
          emailVerified: "some time",
        };
      },
    };
    const res = await POST(req as NextRequest);
    const json = await new Response(res.body).json();
    expect(json).toEqual({
      created: "2024-07-15T23:10:09.945Z",
      deleted: null,
      email: "no@no.com",
      emailVerified: null,
      familyName: null,
      givenName: null,
      id: "0190b7cd-661a-76d4-ba6e-6ae2c383e3c1",
      name: null,
      picture: null,
      tenants: ["12345"],
      updated: "2024-07-15T23:10:09.945Z",
    });
    expect(runCommands).toEqual([
      'INSERT INTO users.users (email, name, family_name, given_name, picture) VALUES ( test@test.com, test@test.com, test@test.com, test@test.com, test@test.com ) RETURNING id, email, name, family_name AS "familyName", given_name AS "givenName", picture, created, updated;',
      "INSERT INTO users.tenant_users (tenant_id, user_id, email) VALUES ( 12345, 0190b7cd-661a-76d4-ba6e-6ae2c383e3c1, test@test.com )",
    ]);
  });
});
