import { Logger } from "@nile-auth/logger";
import NextAuth, { AuthOptions as NextAuthOptions } from "next-auth";

import { buildOptions } from "./utils";
import { nextOptions } from "./nextOptions";
import getDbInfo from "@nile-auth/query/getDbInfo";
import { AuthOptions } from "./types";
import { X_NILE_ORIGIN, X_NILE_TENANT_ID } from "./next-auth/cookies";
import { isFQDN } from "validator";

const { warn } = Logger("[nile-auth]");

export * from "./types";

type AppParams = {
  params: {
    nextauth: string[];
  };
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
  { params }: AppParams,
  config?: AuthOptions,
) {
  const dbInfo = getDbInfo(undefined, req);
  if (!dbInfo) {
    return new Response("database info is missing", { status: 400 });
  }

  const origin = req.headers.get(X_NILE_ORIGIN);
  const tenantId = req.headers.get(X_NILE_TENANT_ID);

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
    const handler = await NextAuth(
      req as unknown as any, // NextApiRequest
      { params } as unknown as any, // NextApiResponse
      opts as unknown as NextAuthOptions,
    );

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
