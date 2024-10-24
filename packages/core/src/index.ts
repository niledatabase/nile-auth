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
  process.env.NEXTAUTH_URL = String(origin);

  const [options, useJwt] = await nextOptions(req, dbInfo);
  const cfg = { ...options, ...dbInfo, useJwt, ...config };
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
      error("error occurred in NileAuth impl", {
        message: e.message,
        stack: e.stack,
      });
    }
  }
  return new Response(null, { status: 500 });
}
export { auth } from "./auth";
export { getSecureCookies } from "./nextOptions";
