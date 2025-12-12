import { getToken, JWT } from "next-auth/jwt";
import { Logger } from "@nile-auth/logger";
import { Pool } from "pg";
import getDbInfo from "@nile-auth/query/getDbInfo";
import { query } from "@nile-auth/query";
import { getSecureCookies } from "./next-auth/cookies";

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
    debug("token taken from request", { token });
    const now = Math.floor(Date.now() / 1000);
    if (
      token &&
      typeof token.exp === "number" &&
      !isNaN(token.exp) &&
      token.exp > now
    ) {
      try {
        if (typeof token.jti !== "string") {
          throw new Error("JWT missing jti");
        }
        const dbInfo = getDbInfo(undefined, req);
        const pool = new Pool(dbInfo);
        const sql = await query(pool);
        const sessions = await sql`
          SELECT
            expires_at
          FROM
            auth.sessions
          WHERE
            session_token = ${token.jti}
        `;
        if (
          sessions &&
          "rowCount" in sessions &&
          sessions.rowCount > 0 &&
          sessions.rows[0]?.expires_at &&
          new Date(sessions.rows[0].expires_at).getTime() > Date.now()
        ) {
          return [{ user: { id: String(token.id) } }];
        }
      } catch (e) {
        if (e instanceof Error) {
          warn("revocation check failed", {
            message: e.message,
            stack: e.stack,
          });
        }
      }
    }
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
