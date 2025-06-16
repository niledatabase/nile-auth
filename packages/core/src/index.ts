import { Logger, ResponderFn } from "@nile-auth/logger";
import NextAuth, { AuthOptions as NextAuthOptions } from "next-auth";

import { buildOptions } from "./utils";
import { nextOptions } from "./nextOptions";
import getDbInfo from "@nile-auth/query/getDbInfo";
import { getOrigin, getTenantCookie } from "./next-auth/cookies";
import { isFQDN } from "validator";
import { ActionableErrors, AuthOptions } from "./types";
import { findCallbackCookie } from "./next-auth/cookies";
import { sendVerifyEmail } from "./next-auth/providers/email";
import { validCsrfToken } from "./next-auth/csrf";
import { TENANT_COOKIE } from "./next-auth/cookies/constants";

export { maxAge } from "./nextOptions";

const { warn } = Logger("[nile-auth]");

export * from "./types";

type AppParams = {
  params: {
    nextauth: string[];
  };
  responder: ResponderFn;
};

function isWellFormedUrl(input: string) {
  try {
    const url = new URL(input);
    return (
      url.protocol.startsWith("http") &&
      isFQDN(url.hostname, { require_tld: false }) // allows localhost etc.
    );
  } catch (e) {
    warn("Invalid nile origin url sent", { input });
    return false;
  }
}

export default async function NileAuth(
  req: Request,
  { responder, params }: AppParams,
  config?: AuthOptions,
) {
  const dbInfo = getDbInfo(undefined, req);
  if (!dbInfo) {
    return new Response("database info is missing", { status: 400 });
  }

  // the origin comes from a client because of the proxy
  // if you make these calls server side, there is no origin, but we need
  // to use the request url as the value to be sure we use cookies correctly
  const origin = getOrigin(req);
  const tenantId = getTenantCookie(req);

  const isGoodUrl = isWellFormedUrl(String(origin));
  if (!isGoodUrl) {
    return new Response("The request origin is not a well formed URL.", {
      status: 400,
    });
  }
  process.env.NEXTAUTH_URL = String(origin);

  const [options] = await nextOptions(req, dbInfo, tenantId);
  if (!options?.providers) {
    return new Response(
      "No providers have been configured. Check the database.",
      { status: 400 },
    );
  }
  const cfg: AuthOptions = { ...options, ...dbInfo, ...config } as AuthOptions;
  const opts = buildOptions(cfg);
  try {
    const preserve = await req.clone();
    const handler = await NextAuth(
      req as unknown as any, // NextApiRequest
      { params } as unknown as any, // NextApiResponse
      opts as unknown as NextAuthOptions,
    );

    if (handler.status === 401) {
      const checker = handler.clone();
      const checkerBody = await checker.json();
      if (checkerBody.url) {
        const searchParams = new URL(checkerBody.url).searchParams;
        const error = searchParams.get("error");

        // The user exists (SSO), but tried to login with username/password.
        // Send an email to that user forcing them to verify themselves
        if (error === ActionableErrors.notVerified) {
          return await sendVerifyEmail({
            req: preserve,
            responder,
          });
        }
      }
    }
    return handler;
  } catch (e) {
    if (e instanceof Error) {
      const [, code, message] = /\[(.*)\]: (.*)/.exec(e.message) ?? [];
      if (code !== "SIGNIN_EMAIL_ERROR") {
        warn("error occurred in NileAuth impl", {
          message: e.message,
          stack: e.stack,
          req,
          params,
          opts,
          cfg,
        });
      }
      if (message) {
        return new Response(
          JSON.stringify({
            url: `${origin}?${new URLSearchParams({ error: message }).toString()}`,
          }),
          {
            status: 400,
          },
        );
      }
      return new Response(
        JSON.stringify({
          url: `${origin}?${new URLSearchParams({ error: e.message }).toString()}`,
        }),
        {
          status: 400,
        },
      );
    }
  }
  return new Response(
    JSON.stringify({
      url: `${origin}?${new URLSearchParams({ error: "An unexpected exception has occurred" }).toString()}`,
    }),
    { status: 500 },
  );
}
export { auth } from "./auth";
