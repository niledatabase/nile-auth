import { NextRequest } from "next/server";
import { GET, POST } from "./route";

let runCommands: string[] = [];
jest.mock("@nile-auth/query", () => ({
  queryBySingle: jest.fn(
    () =>
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

        if (text.includes("verification_tokens")) {
          return {
            rows: [
              {
                token: "abc123",
                identifier: "test@example.com",
                expires: new Date(Date.now() + 10000).toISOString(),
              },
            ],
          };
        }

        if (text.includes("users.users")) {
          return {
            rows: [{}],
          };
        }

        return { rows: [] };
      },
  ),
  queryByReq: jest.fn(
    () =>
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

        if (text.includes("verification_tokens")) {
          return [
            {
              rows: [
                {
                  token: "abc123",
                  identifier: "test@example.com",
                  expires: new Date(Date.now() + 10000).toISOString(),
                },
              ],
            },
          ];
        }

        if (text.includes("users.users")) {
          return [
            {
              rows: [{}],
            },
          ];
        }

        return [{ rows: [] }];
      },
  ),
}));

jest.mock("@nile-auth/core/csrf", () => ({
  validCsrfToken: () => [true, "token"],
}));

jest.mock("@nile-auth/logger", () => ({
  EventEnum: { VERIFY_EMAIL: "VERIFY_EMAIL" },
  Logger: () => ({ debug: jest.fn(), info: jest.fn() }),
  ResponseLogger: () => [
    jest.fn(
      (body, { status = 200, headers = {} }) =>
        new Response(body, { status, headers }),
    ),
    { error: (e: Error) => console.log(e) },
  ],
}));

function createMockRequest(url: string): NextRequest {
  return { url } as unknown as NextRequest;
}
function createMockRequestWithUrl(
  url: string,
  body?: Record<string, any>,
): NextRequest {
  return {
    url,
    headers: new Headers({ cookie: "nile.callback-url=http://localhost:3000" }),
    async json() {
      return body;
    },
    async formData() {
      const fd = new FormData();
      if (body) {
        fd.append("email", body.email);
        fd.append("resetUrl", body.resetUrl);
        fd.append("csrfToken", body.csrfToken);
        fd.append("redirectUrl", body.redirectUrl);
      }
      return fd;
    },
    clone: jest.fn(() => ({
      json: () => body,
      async formData() {
        const fd = new FormData();
        if (body) {
          fd.append("email", body.email);
          fd.append("resetUrl", body.resetUrl);
          fd.append("csrfToken", body.csrfToken);
          fd.append("redirectUrl", body.redirectUrl);
        }
        return fd;
      },
    })),
  } as unknown as NextRequest;
}

describe("GET /verify-email", () => {
  beforeEach(() => {
    runCommands = [];
  });

  it("verifies email when token is valid and not expired", async () => {
    const req = createMockRequest(
      "https://example.com/api/verify-email?token=abc123&identifier=test@example.com&callbackUrl=https://redirect.com",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(runCommands).toEqual([
      "SELECT * FROM auth.verification_tokens WHERE identifier = test@example.com AND token = abc123",
      "UPDATE users.users SET email_verified = CURRENT_TIMESTAMP WHERE email = test@example.com",
    ]);
  });

  it("redirects when query fails", async () => {
    const { queryBySingle } = await import("@nile-auth/query");
    (queryBySingle as jest.Mock).mockImplementation(
      () =>
        async function sql() {
          return { error: new Error("DB error"), rows: [] };
        },
    );

    const req = createMockRequest(
      "https://example.com/api/verify-email?token=abc123&identifier=test@example.com&callbackUrl=https://fail.com",
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://fail.com");
  });

  it("returns 200 if token is expired", async () => {
    const { queryBySingle } = await import("@nile-auth/query");
    (queryBySingle as jest.Mock).mockImplementation(
      () =>
        async function sql() {
          return {
            rows: [
              {
                token: "abc123",
                identifier: "test@example.com",
                expires: new Date(Date.now() - 10000).toISOString(),
              },
            ],
          };
        },
    );

    const req = createMockRequest(
      "https://example.com/api/verify-email?token=abc123&identifier=test@example.com&callbackUrl=https://expired.com",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(runCommands).not.toContainEqual(
      expect.stringContaining("UPDATE users.users SET email_verified"),
    );
  });
});

describe("POST /verify-email", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    runCommands = [];
  });
  it("sends a verification email", async () => {
    const { queryBySingle, queryByReq } = await import("@nile-auth/query");
    (queryBySingle as jest.Mock).mockImplementation(
      () =>
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

          if (text.includes("verification_tokens")) {
            return {
              rows: [
                {
                  token: "abc123",
                  identifier: "test@example.com",
                  expires: new Date(Date.now() + 10000).toISOString(),
                },
              ],
            };
          }

          if (text.includes("users.users")) {
            return {
              rows: [{}],
            };
          }

          return { rows: [] };
        },
    );

    (queryByReq as jest.Mock).mockImplementation(
      () =>
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

          if (text.includes("verification_tokens")) {
            return [
              {
                rows: [
                  {
                    token: "abc123",
                    identifier: "test@example.com",
                    expires: new Date(Date.now() + 10000).toISOString(),
                  },
                ],
              },
            ];
          }

          if (text.includes("users.users")) {
            return [
              {
                rows: [{}],
              },
            ];
          }

          return [{ rows: [] }];
        },
    );
    const body = {
      email: "no@no.com",
      resetUrl: "http://localhost/reset",
      csrfToken: "token",
      redirectUrl: "http://localhost/dashboard",
    };

    const req = createMockRequestWithUrl("http://localhost/verify-email", body);

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(runCommands).toEqual([
      "SELECT * FROM auth.template_variables",
      "SELECT * FROM users.users WHERE email = no@no.com",
      "SELECT * FROM auth.email_templates WHERE name = 'verify_email'",
      "SELECT * FROM auth.email_servers ORDER BY created DESC LIMIT 1",
      expect.stringMatching(
        /^INSERT INTO auth\.verification_tokens \(identifier, token, expires\) VALUES \( no@no\.com, [a-f0-9]{64}, .*Z \) ON CONFLICT \(identifier\) DO UPDATE SET token = EXCLUDED\.token, expires = EXCLUDED\.expires$/,
      ),
    ]);
  });
});
