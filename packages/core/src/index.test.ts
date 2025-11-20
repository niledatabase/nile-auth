jest.mock("next-auth", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("./nextOptions", () => ({
  nextOptions: jest.fn(),
}));

jest.mock("./utils", () => ({
  buildOptions: jest.fn(),
}));

jest.mock("@nile-auth/query/getDbInfo", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("./next-auth/cookies", () => {
  const actual = jest.requireActual("./next-auth/cookies");
  return {
    ...actual,
    getOrigin: jest.fn(),
    getTenantCookie: jest.fn(),
    setTenantCookie: jest.fn(),
  };
});

jest.mock("@nile-auth/query", () => ({
  queryByReq: jest.fn(),
}));

jest.mock("./mfa/providerResponse", () => ({
  buildProviderMfaResponse: jest.fn(),
}));

jest.mock("./next-auth/providers/email", () => ({
  sendVerifyEmail: jest.fn(),
}));

import NileAuth from "./index";
import NextAuth from "next-auth";
import { nextOptions } from "./nextOptions";
import { buildOptions } from "./utils";
import getDbInfo from "@nile-auth/query/getDbInfo";
import {
  getTenantCookie,
  getOrigin,
  setTenantCookie,
} from "./next-auth/cookies";
import { queryByReq } from "@nile-auth/query";
import { buildProviderMfaResponse } from "./mfa/providerResponse";

const nextAuthMock = NextAuth as jest.MockedFunction<typeof NextAuth>;
const nextOptionsMock = nextOptions as jest.MockedFunction<typeof nextOptions>;
const buildOptionsMock = buildOptions as jest.MockedFunction<
  typeof buildOptions
>;
const getDbInfoMock = getDbInfo as jest.MockedFunction<typeof getDbInfo>;
const getTenantCookieMock = getTenantCookie as jest.MockedFunction<
  typeof getTenantCookie
>;
const getOriginMock = getOrigin as jest.MockedFunction<typeof getOrigin>;
const setTenantCookieMock = setTenantCookie as jest.MockedFunction<
  typeof setTenantCookie
>;
const queryByReqMock = queryByReq as jest.MockedFunction<typeof queryByReq>;
const buildProviderMfaResponseMock =
  buildProviderMfaResponse as jest.MockedFunction<
    typeof buildProviderMfaResponse
  >;

describe("NileAuth", () => {
  const dbInfo = {
    host: "localhost",
    database: "nile",
    user: "nile",
    password: "secret",
    port: 5432,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getDbInfoMock.mockReturnValue(dbInfo as any);
    nextOptionsMock.mockResolvedValue([{ providers: [{}] } as any]);
    buildOptionsMock.mockReturnValue({} as any);
    getOriginMock.mockReturnValue("https://example.com");
    getTenantCookieMock.mockReturnValue(null);
    buildProviderMfaResponseMock.mockResolvedValue(null);
    nextAuthMock.mockResolvedValue(new Response(null, { status: 200 }));
    setTenantCookieMock.mockReturnValue(
      new Headers([["set-cookie", "tenant=new"]]),
    );
  });

  it("appends tenant cookie header after a successful credentials callback", async () => {
    const executedQueries: string[] = [];
    queryByReqMock.mockResolvedValueOnce(async function sql(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<any> {
      let text = strings[0] ?? "";
      for (let i = 1; i < strings.length; i++) {
        text += `$${i}${strings[i] ?? ""}`;
      }
      values.forEach((val, idx) => {
        text = text.replace(`$${idx + 1}`, String(val));
      });
      text = text.replace(/\n\s+/g, " ").trim();
      executedQueries.push(text);
      return [
        {
          rowCount: 1,
          rows: [{ id: "tenant-123", name: "Tenant 123" }],
        },
      ];
    });

    const form = new FormData();
    form.set("email", "unit@example.com");
    const req = new Request(
      "https://example.com/api/auth/[...nextauth]/callback/credentials",
      {
        method: "POST",
        body: form,
      },
    );

    const res = await NileAuth(req, {
      params: { nextauth: ["callback", "credentials"] },
    });

    expect(setTenantCookieMock).toHaveBeenCalledWith(req, [
      { id: "tenant-123", name: "Tenant 123" },
    ]);
    expect(res.headers.get("set-cookie")).toEqual("tenant=new");
    expect(executedQueries).toEqual([
      "SELECT DISTINCT t.id, t.name FROM public.tenants t JOIN users.tenant_users tu ON t.id = tu.tenant_id JOIN users.users u ON u.id = tu.user_id WHERE LOWER(u.email) = LOWER(unit@example.com) AND tu.deleted IS NULL AND t.deleted IS NULL AND u.deleted IS NULL",
    ]);
  });
});
