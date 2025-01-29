import { NextRequest } from "next/server";

import { queryByReq, queryBySingle } from "@nile-auth/query";

import { GET, POST, PUT } from "./route";
import { getCookieParts } from "@nile-auth/core/csrf";

jest.mock("../../../../../../../../packages/query/src/query", () => ({
  handleFailure: jest.fn(),
  queryByReq: jest.fn(),
  queryBySingle: jest.fn(),
  formatTime: jest.fn(),
}));

jest.mock(
  "../../../../../../../../packages/core/src/next-auth/cookies",
  () => ({
    getSecureCookies: jest.fn(() => false),
    getCsrfTokenCookie: jest.fn(),
    getCallbackCookie: jest.fn(() => ({ name: "callback" })),
    getPasswordResetCookie: jest.fn(() => ({
      name: "reset",
      options: { secure: true, "max-age": 14000 },
    })),
    getCookie: jest.fn(),
  }),
);
const SECRET_HASH = "tokenemailsuper_secret";
jest.mock("../../../../../../../../packages/core/src/next-auth/csrf", () => ({
  validCsrfToken: jest.fn(() => [true]),
  createHash: jest.fn((str) => str),
  getCookieParts: jest.fn(() => ["token", SECRET_HASH]),
}));

describe("generatePasswordToken", () => {
  it("generates a password token", async () => {
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
    });
    // @ts-expect-error - test
    queryBySingle.mockReturnValueOnce(async function sql(
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
        return { rows: [{ email: "email" }] };
      }
      if (text.includes("auth.template_variables")) {
        return { rows: [{ app_name: "fancy_app" }] };
      }
      return { rows: [] };
    });
    const req = {
      url: "http://localhost",
      async json() {
        return { name: "garbage", email: "email" };
      },
    };
    await POST(req as NextRequest);
    expect(runCommands).toEqual([
      "SELECT * FROM auth.template_variables",
      "SELECT * FROM users.users WHERE email = email",
      "SELECT * FROM auth.email_templates WHERE name = 'password_reset'",
      "SELECT * FROM auth.email_servers ORDER BY created DESC LIMIT 1",
      expect.stringMatching(
        /INSERT INTO auth.verification_tokens.*VALUES \( email, .*, .*\)/,
      ), // Ensures dynamic values are present
    ]);
  });

  it("validates a token, sets a cookie ", async () => {
    const runCommands: string[] = [];
    // @ts-expect-error - test
    queryBySingle.mockReturnValueOnce(async function sql(
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
      if (text.includes("auth.verification_tokens")) {
        return {
          rows: [
            {
              expires: new Date().setHours(new Date().getHours() + 1),
              token: "token",
              identifier: "identifier",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const req = {
      url: "http://localhost?callbackURL=http://localhost:3000&token=token&identifier=identifier",
      async json() {
        return { name: "garbage", email: "email" };
      },
    };
    const response = await GET(req as NextRequest);
    expect(runCommands).toEqual([
      "SELECT * FROM auth.verification_tokens WHERE identifier = identifier AND token = token",
    ]);
    const responseHeaders = new Headers(response.headers);
    expect(responseHeaders.get("Set-Cookie")).toEqual(
      "reset=token%7Ctokenidentifiersuper_secret; secure=true; max-age=14000",
    );
  });

  it("resets a password", async () => {
    const runCommands: string[] = [];

    // @ts-expect-error - test
    queryBySingle.mockReturnValueOnce(async function sql(
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
        return {
          rows: [
            {
              email: "email",
            },
          ],
        };
      }
      if (text.includes("auth.verification_tokens")) {
        return {
          rows: [
            {
              expires: new Date().setHours(new Date().getHours() + 1),
              token: "token",
              identifier: "email",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const req = {
      url: "http://localhost?callbackURL=http://localhost:3000&token=token&identifier=identifier",
      async json() {
        return { name: "garbage", email: "email" };
      },
    };
    await PUT(req as NextRequest);
    expect(runCommands).toEqual([
      "SELECT * FROM auth.verification_tokens WHERE token = token",
      "DELETE FROM auth.verification_tokens WHERE identifier = email",
      "SELECT * FROM users.users WHERE email = email",
      "UPDATE auth.credentials SET payload = jsonb_build_object( 'crypt', 'crypt-bf/8', 'hash', public.crypt ( undefined, public.gen_salt ('bf', 8) ), 'email', email::text ) WHERE user_id = undefined RETURNING *;",
    ]);
  });
  it("does nothing on an expired token", async () => {
    const runCommands: string[] = [];

    // @ts-expect-error - test
    queryBySingle.mockReturnValueOnce(async function sql(
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
        return {
          rows: [
            {
              email: "email",
            },
          ],
        };
      }
      if (text.includes("auth.verification_tokens")) {
        return {
          rows: [
            {
              expires: new Date().setHours(new Date().getHours() - 1),
              token: "token",
              identifier: "email",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const req = {
      url: "http://localhost?callbackURL=http://localhost:3000&token=token&identifier=identifier",
      async json() {
        return { name: "garbage", email: "email" };
      },
    };
    const res = await PUT(req as NextRequest);
    expect(runCommands).toEqual([
      "SELECT * FROM auth.verification_tokens WHERE token = token",
    ]);
    expect(await res.text()).toEqual("Token expired");
  });
  it("does nothing if the identifier and email don't match", async () => {
    const runCommands: string[] = [];

    // @ts-expect-error - test
    queryBySingle.mockReturnValueOnce(async function sql(
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
        return {
          rows: [
            {
              email: "email",
            },
          ],
        };
      }
      if (text.includes("auth.verification_tokens")) {
        return {
          rows: [
            {
              expires: new Date().setHours(new Date().getHours() + 1),
              token: "token",
              identifier: "email",
            },
          ],
        };
      }
      return { rows: [] };
    });
    const req = {
      url: "http://localhost?callbackURL=http://localhost:3000&token=token&identifier=identifier",
      async json() {
        return { name: "garbage", email: "haxxzors" };
      },
    };
    const res = await PUT(req as NextRequest);
    expect(runCommands).toEqual([
      "SELECT * FROM auth.verification_tokens WHERE token = token",
    ]);
    expect(await res.text()).toEqual("Unable to process request");
  });
  it("does nothing if the client token is garbage", async () => {
    const runCommands: string[] = [];

    // @ts-expect-error - test
    queryBySingle.mockReturnValueOnce(async function sql(
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
        return {
          rows: [
            {
              email: "email",
            },
          ],
        };
      }
      if (text.includes("auth.verification_tokens")) {
        return {
          rows: [
            {
              expires: new Date().setHours(new Date().getHours() + 1),
              token: "token",
              identifier: "email",
            },
          ],
        };
      }
      return { rows: [] };
    });

    // @ts-expect-error - test
    getCookieParts.mockReturnValueOnce(["garbage", SECRET_HASH]);
    const req = {
      url: "http://localhost",
      async json() {
        return { name: "garbage", email: "email" };
      },
    };
    const res = await PUT(req as NextRequest);
    expect(runCommands).toEqual([
      "SELECT * FROM auth.verification_tokens WHERE token = garbage",
    ]);
    expect(await res.text()).toEqual("Unable to process request");
  });
});
