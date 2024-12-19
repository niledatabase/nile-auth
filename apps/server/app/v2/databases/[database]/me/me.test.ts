import { NextRequest } from "next/server";
import { GET } from "./route";

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
];
const tenants = ["019073f4-75a6-72b9-a379-5ed38ca0d01a"];

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
        if (text.includes("users.users")) {
          return [
            {
              rowCount: 1,
              rows: users,
            },
          ];
        }
        if (text.includes("tenants")) {
          return [
            {
              rowCount: 1,
              rows: tenants,
            },
          ];
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

describe("me", () => {
  beforeEach(() => {
    runCommands = [];
  });
  it("returns the session user", async () => {
    const req = {
      url: "http://localhost",
      async json() {
        return users;
      },
    };
    const res = await GET(req as NextRequest);
    expect(res?.status).toEqual(200);

    expect(runCommands).toEqual([
      'SELECT id, email, name, family_name AS "familyName", given_name AS "givenName", picture, created, updated, email_verified AS "emailVerified" FROM users.users WHERE id = some-uuid AND deleted IS NULL',
      "SELECT DISTINCT t.id FROM tenants t JOIN tenant_users tu ON t.id = tu.tenant_id WHERE tu.user_id = some-uuid AND tu.deleted IS NULL AND t.deleted IS NULL",
    ]);
  });
});
