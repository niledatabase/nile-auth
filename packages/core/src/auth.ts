import { getToken, JWT } from "next-auth/jwt";
import { Logger } from "@nile-auth/logger";
import { Pool } from "pg";
import getDbInfo from "@nile-auth/query/getDbInfo";
import { getSecureCookies } from "./next-auth/cookies";
import { getJwtSession } from "./next-auth/jwtSession";

type SessionUser = { user?: { id?: string } };

const { warn, debug } = Logger("[nile-auth]");

export async function buildFetch(
  req: Request,
): Promise<[URL, Headers] | [SessionUser]> {
  const secureCookie = getSecureCookies(req);
  const cookiePrefix = secureCookie ? "__Secure-" : "";

  const cookieName = `${cookiePrefix}nile.session-token`;
  debug(`Obtaining token from ${cookieName}`);

  const castedReq = req as any;

  const token: JWT | null = await getToken<false>({
    req: castedReq,
    cookieName,
  });

  if (token) {
    let pool: Pool | undefined;
    try {
      pool = new Pool(getDbInfo(undefined, req));
      const active = await getJwtSession(pool, token);
      return [{ user: active ? { id: active.user.id } : undefined }];
    } catch (e) {
      if (e instanceof Error) {
        warn("revocation check failed", { message: e.message });
      }
    } finally {
      await pool?.end();
    }
    return [{ user: undefined }];
  }
  const url = new URL(req.url);
  const paths = url.pathname.split("/").slice(0, 4);
  // this is a call to itself, but need to set the right headers
  const sessionUrl = new URL(
    `http://${url.host}${paths.join("/")}/auth/session`,
  );
  const headers = new Headers(req.headers);

  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return [sessionUrl, headers];
}

export async function auth(req: Request): Promise<[void | SessionUser]> {
  const [sessionUrl, headers] = await buildFetch(req);
  if (sessionUrl && "user" in sessionUrl) {
    return [sessionUrl];
  }
  try {
    if (sessionUrl instanceof URL) {
      debug("retrieving session token from", { href: sessionUrl.href });
      const res = await fetch(sessionUrl, { headers });
      const body = (await new Response(res.body).json()) as any;
      debug(JSON.stringify(body));
      return [body];
    }
  } catch (e) {
    if (e instanceof Error) {
      warn("auth failed", { stack: e.stack, message: e.message });
    }
    return [undefined];
  }
  return [undefined];
}
