import { Logger } from "@nile-auth/logger";
import NextAuth, { AuthOptions as NextAuthOptions } from "next-auth";

import { buildOptionsFromReq } from "./utils";
import { nextOptions } from "./nextOptions";
import getDbInfo from "@nile-auth/query/getDbInfo";
import { AuthOptions } from "./types";

const { error } = Logger("[nile-auth]");

export * from "./types";

type AppParams = {
  params: {
    nextauth: string[];
  };
};

export default async function NileAuth(
  req: Request,
  { params }: AppParams,
  config?: AuthOptions,
) {
  const dbInfo = getDbInfo(undefined, req);
  if (!dbInfo) {
    return new Response("database info is missing", { status: 400 });
  }

  const origin = req.headers.get("niledb-origin");
  const tenantId = req.headers.get("niledb-tenant-id");
  process.env.NEXTAUTH_URL = String(origin);

  const [options] = await nextOptions(req, dbInfo, tenantId);
  if (!options?.providers) {
    return new Response(
      "No providers have been configured. Check the database.",
      { status: 400 },
    );
  }
  const cfg: AuthOptions = { ...options, ...dbInfo, ...config } as AuthOptions;
  const opts = buildOptionsFromReq(req, cfg);

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
      // some extra noise we (probably) don't need to log due to configuration problems
      if (code !== "SIGNIN_EMAIL_ERROR") {
        error("error occurred in NileAuth impl", {
          message: e.message,
          stack: e.stack,
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
