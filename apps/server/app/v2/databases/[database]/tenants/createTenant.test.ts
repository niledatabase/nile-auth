import { NextRequest } from "next/server";

import { auth } from "@nile-auth/core";
import { queryByReq } from "@nile-auth/query";
import { POST } from "./route";

jest.mock("@nile-auth/core", () => ({
  auth: jest.fn(),
  setTenantCookie: jest.fn(
    () => new Headers({ "set-cookie": "tenant=some-id" }),
  ),
}));

jest.mock("@nile-auth/query", () => ({
  queryByReq: jest.fn(),
}));

jest.mock("@nile-auth/logger", () => ({
  ResponseLogger: () => [
    (body: string | null, options?: any) =>
      new Response(body, {
        status: options?.status ?? 200,
        headers: options?.headers,
      }),
    { error: jest.fn() },
  ],
  Logger: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  EventEnum: {
    CREATE_TENANT: "CREATE_TENANT",
  },
}));

describe("create tenant", () => {
  it("401s if the user is not authenticated", async () => {
    (auth as jest.Mock).mockResolvedValueOnce([null]);

    const req = {
      async json() {
        return { name: "My New Tenant" };
      },
    };

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(401);
  });

  it("400s if the tenant name is missing", async () => {
    // @ts-expect-error test
    auth.mockResolvedValueOnce([{ user: { id: "user-uuid" } }]);

    const req = {
      async json() {
        return {}; // missing name
      },
    };

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
  });

  it("creates a tenant and assigns the user", async () => {
    const queries: string[] = [];

    (auth as jest.Mock).mockResolvedValueOnce([{ user: { id: "user-uuid" } }]);

    (queryByReq as jest.Mock).mockResolvedValueOnce(async function sql(
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
      queries.push(text);

      if (text.includes("FROM users.users")) {
        return [
          {
            rows: [{ id: "user-uuid", email: "test@example.com" }],
          },
        ];
      }
      if (text.includes("INSERT INTO public.tenants")) {
        return [
          {
            rows: [
              {
                id: "tenant-uuid",
                name: "My New Tenant",
              },
            ],
            rowCount: 1,
          },
        ];
      }
      if (text.includes("INSERT INTO users.tenant_users")) {
        return [
          {
            rowCount: 1,
          },
        ];
      }
    });

    const req = {
      async json() {
        return { name: "My New Tenant" };
      },
    };

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ id: "tenant-uuid", name: "My New Tenant" });

    expect(queries).toEqual([
      "SELECT * FROM users.users WHERE id = user-uuid AND deleted IS NULL",
      "INSERT INTO public.tenants (name) VALUES (My New Tenant) RETURNING *",
      "INSERT INTO users.tenant_users (tenant_id, user_id, email) VALUES ( tenant-uuid, user-uuid, test@example.com )",
    ]);
  });
  it("creates a tenant with a custom ID when body.id is provided", async () => {
    const sqlCalls: string[] = [];

    (auth as jest.Mock).mockResolvedValueOnce([{ user: { id: "user-uuid" } }]);

    (queryByReq as jest.Mock).mockResolvedValueOnce(async function sql(
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
      sqlCalls.push(text);

      if (text.includes("FROM users.users")) {
        return [
          {
            rows: [{ id: "user-uuid", email: "user@example.com" }],
          },
        ];
      }

      if (text.includes("INSERT INTO public.tenants")) {
        return [
          {
            rows: [{ id: "custom-tenant-id", name: "Custom Tenant" }],
            rowCount: 1,
          },
        ];
      }

      if (text.includes("INSERT INTO users.tenant_users")) {
        return [
          {
            rowCount: 1,
          },
        ];
      }
    });

    const req = {
      async json() {
        return { name: "Custom Tenant", id: "custom-tenant-id" };
      },
    };

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ id: "custom-tenant-id", name: "Custom Tenant" });

    expect(sqlCalls).toEqual([
      "SELECT * FROM users.users WHERE id = user-uuid AND deleted IS NULL",
      "INSERT INTO public.tenants (name, id) VALUES ( Custom Tenant, custom-tenant-id ) RETURNING *",
      "INSERT INTO users.tenant_users (tenant_id, user_id, email) VALUES ( custom-tenant-id, user-uuid, user@example.com )",
    ]);
  });
});
