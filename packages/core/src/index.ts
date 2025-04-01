import { Logger, ResponderFn } from "@nile-auth/logger";
import NextAuth, { AuthOptions as NextAuthOptions } from "next-auth";

import { buildOptions } from "./utils";
import { nextOptions } from "./nextOptions";
import getDbInfo from "@nile-auth/query/getDbInfo";
import { ActionableErrors, AuthOptions } from "./types";
import {
  findCallbackCookie,
  X_NILE_ORIGIN,
  X_NILE_TENANT_ID,
} from "./next-auth/cookies";
import { sendLoginAttemptEmail } from "./next-auth/providers/email";
import { validCsrfToken } from "./next-auth/csrf";

export { maxAge } from "./nextOptions";

const { warn } = Logger("[nile-auth]");

export * from "./types";

type AppParams = {
  params: {
    nextauth: string[];
  };
  responder: ResponderFn;
};

export default async function NileAuth(
  req: Request,
  { responder, params }: AppParams,
  config?: AuthOptions,
) {
  const dbInfo = getDbInfo(undefined, req);
  if (!dbInfo) {
    return new Response("database info is missing", { status: 400 });
  }

  const origin = req.headers.get(X_NILE_ORIGIN);
  const tenantId = req.headers.get(X_NILE_TENANT_ID);
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
          const formData = await preserve.formData();
          const email = String(formData.get("email"));
          const resetUrl = String(formData.get("resetUrl"));
          const csrfToken = formData.get("csrfToken");
          const redirectUrl = formData.get("redirectUrl");

          const [hasValidToken, csrf] = await validCsrfToken(
            req,
            process.env.NEXTAUTH_SECRET,
          );
          if (!hasValidToken || csrf !== csrfToken) {
            return new Response("Request blocked", { status: 400 });
          }
          const callbackCookie = findCallbackCookie(req);
          const callback = new URL(callbackCookie);
          // the url that redirects
          const url =
            typeof redirectUrl === "string"
              ? redirectUrl
              : `${callback.origin}/api/auth/verify-email`;
          if (email && resetUrl) {
            await sendLoginAttemptEmail({
              req,
              email,
              responder,
              callbackUrl: resetUrl,
              url,
            });
            return new Response(JSON.stringify({ message: "Email sent" }), {
              status: 401,
            });
          }
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
