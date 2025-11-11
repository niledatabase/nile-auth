import { NextRequest } from "next/server";
import { POST } from "./route";

let runCommands: string[] = [];

const mockUser = [
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

const mockTenant = [
  {
    id: "019073f4-75a6-72b9-a379-5ed38ca0d01a",
    created: "2024-07-15T23:10:09.971Z",
    updated: "2024-07-15T23:10:09.971Z",
    deleted: null,
    name: "foo",
  },
];

const mockTenantUsers = [
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

jest.mock("../../../../../../../packages/query/src/query", () => ({
  getRow: jest.fn(),
  handleFailure: jest.fn(),
  queryBySingle: async () =>
    async function sql(strings: TemplateStringsArray, ...values: string[]) {
      let text = strings[0] ?? "";
      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }
      values.forEach((val, idx) => {
        text = text.replace(`$${idx + 1}`, val);
      });
      text = text.replace(/(\n\s+)/g, " ").trim();
      runCommands.push(text);

      if (text.includes("users.users")) {
        return { rows: mockUser, rowCount: 1 };
      }
      if (text.includes("auth.email_templates")) {
        return { rows: mockUser, rowCount: 1 };
      }
      if (text.includes("auth.email_servers")) {
        return { rows: mockTenantUsers };
      }
    },
  queryByReq: async () =>
    async function sql(strings: TemplateStringsArray, ...values: string[]) {
      let text = strings[0] ?? "";
      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }
      values.forEach((val, idx) => {
        text = text.replace(`$${idx + 1}`, val);
      });
      text = text.replace(/(\n\s+)/g, " ").trim();
      runCommands.push(text);

      if (text.includes("tenants")) {
        return [{ rows: mockTenant, rowCount: 1 }];
      }
      if (text.includes("users.users")) {
        return [{ rows: mockUser, rowCount: 1 }];
      }
      if (text.includes("users.tenant_users")) {
        return [{ rows: mockTenantUsers }];
      }
      if (text.includes("has_other_methods")) {
        return [{ rows: [{ has_other_methods: true }] }];
      }
      if (text.includes("auth.template_variables")) {
        return [{ rows: [] }];
      }
    },
}));

jest.mock("../../../../../../../packages/core/src/next-auth/cookies", () => ({
  getSecureCookies: jest.fn(() => false),
  getCsrfTokenCookie: jest.fn(),
  getCallbackCookie: jest.fn(() => ({ name: "callback" })),
  getPasswordResetCookie: jest.fn(() => ({
    name: "reset",
    options: { secure: true, "max-age": 14000 },
  })),
  getCookie: jest.fn(() => "http://localhost:3000"),
}));

jest.mock("../../../../../../../packages/core/src/auth", () => ({
  __esModule: true,
  auth: () => [{ user: { id: "some-uuid" } }],
}));

function createMockRequest(
  url: string,
  body: Record<string, unknown>,
): NextRequest {
  return {
    url,
    async json() {
      return body;
    },
    clone: jest.fn(),
  } as unknown as NextRequest;
}

function expectedUserResponse() {
  return {
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
  };
}

describe("POST /users - user creation logic", () => {
  beforeEach(() => {
    runCommands = [];
  });

  const defaultBody = {
    email: "test@test.com",
    name: "test@test.com",
    familyName: "test@test.com",
    givenName: "test@test.com",
    picture: "test@test.com",
    emailVerified: "some time",
  };

  it("creates a new user", async () => {
    const req = createMockRequest("http://localhost", defaultBody);
    await POST(req);

    expect(runCommands).toEqual([
      "SELECT * FROM users.users WHERE email = test@test.com",
      'INSERT INTO users.users (email, name, family_name, given_name, picture) VALUES ( test@test.com, test@test.com, test@test.com, test@test.com, test@test.com ) RETURNING id, email, email_verified AS "emailVerified", multi_factor AS "multiFactor", name, family_name AS "familyName", given_name AS "givenName", picture, created, updated;',
    ]);
  });

  it("creates a new tenant with the user when `newTenantName` is provided", async () => {
    const req = createMockRequest(
      "http://localhost?newTenantName=foo",
      defaultBody,
    );
    const res = await POST(req);
    const json = await new Response(res.body).json();

    expect(json).toEqual(expectedUserResponse());
    expect(runCommands).toEqual([
      "SELECT * FROM users.users WHERE email = test@test.com",
      'INSERT INTO users.users (email, name, family_name, given_name, picture) VALUES ( test@test.com, test@test.com, test@test.com, test@test.com, test@test.com ) RETURNING id, email, email_verified AS "emailVerified", multi_factor AS "multiFactor", name, family_name AS "familyName", given_name AS "givenName", picture, created, updated;',
      "INSERT INTO tenants (name) VALUES (foo) RETURNING id;",
      "INSERT INTO users.tenant_users (tenant_id, user_id, email) VALUES ( 019073f4-75a6-72b9-a379-5ed38ca0d01a, 0190b7cd-661a-76d4-ba6e-6ae2c383e3c1, test@test.com )",
    ]);
  });

  it("associates an existing tenant with the user when `tenantId` is provided", async () => {
    const req = createMockRequest(
      "http://localhost?tenantId=12345",
      defaultBody,
    );
    const res = await POST(req);
    const json = await new Response(res.body).json();

    expect(json).toEqual({
      ...expectedUserResponse(),
      tenants: ["12345"],
    });

    expect(runCommands).toEqual([
      "SELECT * FROM users.users WHERE email = test@test.com",
      'INSERT INTO users.users (email, name, family_name, given_name, picture) VALUES ( test@test.com, test@test.com, test@test.com, test@test.com, test@test.com ) RETURNING id, email, email_verified AS "emailVerified", multi_factor AS "multiFactor", name, family_name AS "familyName", given_name AS "givenName", picture, created, updated;',
      "INSERT INTO users.tenant_users (tenant_id, user_id, email) VALUES ( 12345, 0190b7cd-661a-76d4-ba6e-6ae2c383e3c1, test@test.com )",
    ]);
  });

  it("handles existing user with unverified email and SSO", async () => {
    const req = {
      url: "http://localhost",
      headers: {
        get: () => ({ cookie: "callback=http://localhost:3000" }), // mock cookies
      },
      async json() {
        return {
          email: "existing@user.com",
          name: "John",
          familyName: "Doe",
          givenName: "John",
          picture: "pic.png",
          redirectUrl: "http://localhost/custom-verify",
          callbackUrl: "http://localhost/callback",
        };
      },
      clone: jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({ email: "existing@user.com" }),
      }),
    };

    runCommands = [];

    // Override mock to simulate existing user with unverified email and SSO
    const { getRow } = await import(
      "../../../../../../../packages/query/src/query"
    );
    (getRow as jest.Mock).mockImplementation((row: any) => {
      if (row?.rows[0]?.emailVerified) {
        return {
          id: "existing-user-id",
          email: "existing@user.com",
          email_verified: false,
        };
      }
      if (row?.rows?.[0]?.has_other_methods !== undefined) {
        return { has_other_methods: true };
      }
      return row?.rows?.[0] ?? null;
    });

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toEqual(400);

    expect(runCommands).toEqual([
      "SELECT * FROM users.users WHERE email = existing@user.com",
      "SELECT EXISTS ( SELECT 1 FROM auth.credentials WHERE user_id = 0190b7cd-661a-76d4-ba6e-6ae2c383e3c1 AND method NOT IN ('EMAIL_PASSWORD', 'MFA') ) AS has_other_methods;",
    ]);
  });
});
