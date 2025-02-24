import { NextRequest } from "next/server";
import * as handlers from "../auth/[...nextauth]/route";
import {
  getCallbackCookie,
  getCookie,
  getCsrfTokenCookie,
  getSecureCookies,
} from "@nile-auth/core/cookies";
import { getCsrfCookie, getCookieParts } from "@nile-auth/core/csrf";
import { Logger } from "@nile-auth/logger";

const { debug } = Logger("server side login");

const routes = {
  PROVIDERS: "/auth/providers",
  CSRF: "/auth/csrf",
};

export async function login(
  req: NextRequest,
  { params }: { params: { database: string; nextauth: string[] } },
) {
  const { email, password } = await req.json();
  if (!email || !password) {
    throw new Error("Server side login requires a user email and password.");
  }

  const origin = req.headers.get("niledb-origin");
  const reqUrl = new URL(req.url);
  const updatedPath = reqUrl.pathname.replace("/auth/signup", "");

  const sessionUrl = new URL(`${origin}${updatedPath}${routes.PROVIDERS}`);

  const baseHeaders = {
    host: sessionUrl.host,
    "niledb-origin": String(origin),
  };

  const [csrfToken] = getCookieParts(getCsrfCookie(req)) ?? [];

  const signInUrl = req.url.replace("signup", "callback/credentials");

  const useSecureCookies = getSecureCookies(req);
  const callbackCookie = getCookie(
    getCallbackCookie(useSecureCookies).name,
    req.headers,
  );

  const csrfCookie = getCookie(
    getCsrfTokenCookie(useSecureCookies).name,
    req.headers,
  );

  const body = JSON.stringify({
    email,
    password,
    csrfToken,
    callbackUrl: decodeURIComponent(String(callbackCookie ?? origin)),
  });

  const cookie = [
    `${getCsrfTokenCookie(useSecureCookies).name}=${csrfCookie}`,
    `${getCallbackCookie(useSecureCookies).name}=${callbackCookie ?? origin}`,
  ].join("; ");
  const postReq = new NextRequest(signInUrl, {
    method: "POST",
    headers: new Headers({
      ...baseHeaders,
      "content-type": "application/json",
      cookie,
    }),
    body,
  });

  const loginRes = await handlers.POST(postReq, {
    params: { ...params, nextauth: ["callback", "credentials"] },
  });
  const authCookie = loginRes?.headers.get("set-cookie");
  const details = {
    signInCookie: cookie,
    csrfCookie,
    csrfToken,
    useSecureCookies,
    baseHeaders,
  };
  debug("auth cookie", details);
  if (!authCookie) {
    throw new LoginError("authentication failed", details);
  }
  const [, token] =
    /((__Secure-)?nile\.session-token=.+?);/.exec(authCookie) ?? [];
  if (!token) {
    throw new LoginError("Server login failed", details);
  }
  return loginRes.headers;
}

export class LoginError extends Error {
  details: {};
  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = "LoginError";
    this.details = details;
  }
}
