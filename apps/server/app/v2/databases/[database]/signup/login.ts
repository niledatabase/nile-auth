import { NextRequest } from "next/server";
import * as handlers from "../auth/[...nextauth]/route";
import {
  getCallbackCookie,
  getCookie,
  getCsrfTokenCookie,
  getSecureCookies,
} from "@nile-auth/core/cookies";
import { getCsrfCookie, getCsrfParts } from "@nile-auth/core/csrf";

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

  const ORIGIN = req.url.replace("/auth/signup", "");
  const sessionUrl = new URL(`${ORIGIN}${routes.PROVIDERS}`);
  const baseHeaders = {
    host: sessionUrl.host,
    "niledb-origin": ORIGIN,
  };

  const [csrfToken] = getCsrfParts(getCsrfCookie(req)) ?? [];

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
    callbackUrl: decodeURIComponent(String(callbackCookie)),
  });

  const postReq = new NextRequest(signInUrl, {
    method: "POST",
    headers: new Headers({
      ...baseHeaders,
      "content-type": "application/json",
      cookie: [csrfCookie, callbackCookie].join("; "),
    }),
    body,
  });

  const loginRes = await handlers.POST(postReq, {
    params: { ...params, nextauth: ["callback", "credentials"] },
  });
  const authCookie = loginRes?.headers.get("set-cookie");
  if (!authCookie) {
    throw new Error("authentication failed");
  }
  const [, token] =
    /((__Secure-)?nile\.session-token=.+?);/.exec(authCookie) ?? [];
  if (!token) {
    throw new Error("Server login failed");
  }
  return loginRes.headers;
}
