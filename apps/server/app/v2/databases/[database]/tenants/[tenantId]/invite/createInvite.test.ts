import { NextRequest } from "next/server";

import { auth } from "../../../../../../../../../packages/core/src/auth";
import { queryByReq, queryBySingle } from "@nile-auth/query";
import { POST } from "./route";

jest.mock("../../../../../../../../../packages/query/src/query", () => ({
  queryByReq: jest.fn(),
  queryBySingle: jest.fn(),
}));

jest.mock("../../../../../../../../../packages/core/src/auth", () => ({
  auth: jest.fn(),
}));
jest.mock(
  "../../../../../../../../../packages/core/src/next-auth/csrf",
  () => ({
    validCsrfToken: jest.fn(() => [true, "test-csrf"]),
  }),
);
jest.mock("../../../../../../../../../packages/logger/src/logger", () => ({
  Logger: () => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    setMetadata: jest.fn(),
  }),
}));
const mockResponder = jest.fn();
const mockReporter = { error: jest.fn() };

jest.mock(
  "../../../../../../../../../packages/logger/src/ResponseLogger",
  () => ({
    ResponseLogger: jest.fn(() => [mockResponder, mockReporter]),
  }),
);

describe("list invites", () => {
  it("401s if the user is not in the tenant", async () => {
    const commands: string[] = [];
    (queryByReq as jest.Mock).mockReturnValue(async function sql(
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
      if (text.includes("users.tenant_users")) {
        return [null, { rowCount: 0 }];
      }
    });
    (queryBySingle as jest.Mock).mockReturnValue(async function sql(
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
      return { rows: [], error: null };
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
      async formData() {
        const fd = new FormData();
        fd.set("identifier", "user@example.com");
        fd.set("csrfToken", "test-csrf");
        fd.set("redirectUrl", "http://localhost/redirect");
        fd.set("callbackUrl", "http://localhost/callback");
        return fd;
      },
    };

    await POST(req as NextRequest, {
      params: { tenantId: "019073f4-75a6-72b9-a379-5ed38ca0d01a" },
    });
    expect(mockResponder).toHaveBeenCalledWith("Unauthorized.", {
      status: 401,
    });
    // we still do this, because the commands are run, we rely on the DB for permissions
    expect(commands).toEqual([
      "SELECT * FROM public.tenants WHERE id = 019073f4-75a6-72b9-a379-5ed38ca0d01a",
      "SELECT * FROM users.users WHERE email = user@example.com",
      expect.stringMatching(
        /^:SET LOCAL nile\.tenant_id = '019073f4-75a6-72b9-a379-5ed38ca0d01a'; :SET LOCAL nile\.user_id = 'some-uuid'; INSERT INTO auth\.invites \(tenant_id, token, identifier, created_by, expires\) VALUES \( 019073f4-75a6-72b9-a379-5ed38ca0d01a, [a-z0-9]+, user@example\.com, some-uuid, NOW\(\) \+ INTERVAL '7 days' \) ON CONFLICT \(tenant_id, identifier\) DO UPDATE SET token = EXCLUDED\.token, expires = NOW\(\) \+ INTERVAL '7 days' RETURNING \*$/,
      ),
    ]);
  });
  it("allows a user to invite another user in tenant they are in", async () => {
    const mockInvite = {
      tenant_id: "tenant_id",
      token: "token",
      identifier: "identifier",
      created_by: "created_by",
    };
    const commands: string[] = [];
    (queryByReq as jest.Mock).mockReturnValue(async function sql(
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
        return [
          null,
          null,
          {
            rows: [mockInvite],
          },
        ];
      }
      if (text.includes("template_variables")) {
        return [null];
      }
      if (text.includes("users.tenant_users")) {
        return [null, { rowCount: 0 }];
      }
    });
    (queryBySingle as jest.Mock).mockReturnValue(async function sql(
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
      if (text.includes("email_servers")) {
        return { rows: [{ server: "server" }] };
      }
      return { rows: [], error: null };
    });

    (auth as jest.Mock).mockReturnValue([
      {
        user: {
          id: "some-uuid",
        },
      },
    ]);

    const req = {
      url: "http://localhost",
      async formData() {
        const fd = new FormData();
        fd.set("identifier", "user@example.com");
        fd.set("csrfToken", "test-csrf");
        fd.set("redirectUrl", "http://localhost/redirect");
        fd.set("callbackUrl", "http://localhost/callback");
        return fd;
      },
    };

    await POST(req as NextRequest, {
      params: { tenantId: "019073f4-75a6-72b9-a379-5ed38ca0d01a" },
    });
    expect(mockResponder).toHaveBeenCalledWith(JSON.stringify(mockInvite), {
      status: 201,
    });
    // we still do this, because the commands are run, we rely on the DB for permissions
    expect(commands).toEqual([
      "SELECT * FROM public.tenants WHERE id = 019073f4-75a6-72b9-a379-5ed38ca0d01a",
      "SELECT * FROM users.users WHERE email = user@example.com",
      expect.stringMatching(
        /^:SET LOCAL nile\.tenant_id = '019073f4-75a6-72b9-a379-5ed38ca0d01a'; :SET LOCAL nile\.user_id = 'some-uuid'; INSERT INTO auth\.invites \(tenant_id, token, identifier, created_by, expires\) VALUES \( 019073f4-75a6-72b9-a379-5ed38ca0d01a, [a-z0-9]+, user@example\.com, some-uuid, NOW\(\) \+ INTERVAL '7 days' \) ON CONFLICT \(tenant_id, identifier\) DO UPDATE SET token = EXCLUDED\.token, expires = NOW\(\) \+ INTERVAL '7 days' RETURNING \*$/,
      ),
      "SELECT * FROM auth.template_variables",
      "SELECT * FROM auth.email_templates WHERE name = invite_user",
      "SELECT * FROM auth.email_servers ORDER BY created DESC LIMIT 1",
    ]);
  });
});
