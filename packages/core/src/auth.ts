import { getToken, JWT } from "next-auth/jwt";
import { Logger } from "@nile-auth/logger";
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
      return [{ user: { id: String(token.id) } }];
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
