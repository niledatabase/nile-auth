import { getCookie, getCsrfTokenCookie, getSecureCookies } from "./cookies";

export async function createHash(message: string) {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toString();
}

export function getCsrfCookie(req: Request): string | null | undefined {
  const headers = new Headers(req.headers);
  const useSecureCookies = getSecureCookies(req);
  const csrfCookie = getCsrfTokenCookie(useSecureCookies);
  return getCookie(csrfCookie.name, headers);
}
export function getCsrfParts(cookie: undefined | null | string) {
  if (cookie) {
    return decodeURIComponent(cookie).split("|");
  }
}

export async function validCsrfToken(
  req: Request,
  secret: undefined | string,
): Promise<[isTokenValid: boolean, token: void | string]> {
  const token = getCsrfCookie(req);
  const [csrfToken, csrfTokenHash] = getCsrfParts(token) ?? [];
  const expectedCsrfTokenHash = await createHash(`${csrfToken}${secret}`);
  return [csrfTokenHash === expectedCsrfTokenHash, csrfToken];
}
