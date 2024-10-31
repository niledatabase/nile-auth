import { CookieOption, CookiesOptions } from "next-auth";

export function getCallbackCookie(useSecureCookies: boolean): CookieOption {
  const cookiePrefix = useSecureCookies ? "__Secure-" : "";
  return {
    name: `${cookiePrefix}nile.callback-url`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  };
}
export function getCsrfTokenCookie(useSecureCookies: boolean): CookieOption {
  const cookiePrefix = useSecureCookies ? "__Secure-" : "";
  return {
    // Default to __Host- for CSRF token for additional protection if using useSecureCookies
    // NB: The `__Host-` prefix is stricter than the `__Secure-` prefix.
    name: `${cookiePrefix}nile.csrf-token`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  };
}

export function defaultCookies(
  useSecureCookies: boolean,
): Partial<CookiesOptions> {
  const cookiePrefix = useSecureCookies ? "__Secure-" : "";
  return {
    // default cookie options
    sessionToken: {
      name: `${cookiePrefix}nile.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: getCallbackCookie(useSecureCookies),
    csrfToken: getCsrfTokenCookie(useSecureCookies),
    pkceCodeVerifier: {
      name: `${cookiePrefix}nile.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 60 * 15, // 15 minutes in seconds
      },
    },
    state: {
      name: `${cookiePrefix}nile.state`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 60 * 15, // 15 minutes in seconds
      },
    },
    nonce: {
      name: `${cookiePrefix}nile.nonce`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    //@ts-expect-error taken from the docs, ts does not know about it
    webauthnChallenge: {
      name: `${cookiePrefix}nile.challenge`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 60 * 15, // 15 minutes in seconds
      },
    },
  };
}

export function getSecureCookies(req: Request): boolean {
  const secureCookies = req.headers.get("niledb-useSecureCookies");

  if (secureCookies != null) {
    return Boolean(secureCookies);
  }

  const origin = req.headers.get("niledb-origin");
  return Boolean(String(origin).startsWith("https://"));
}

export function getCookie(cookieKey: void | string, headers: Headers) {
  const cookie = headers.get("cookie")?.split("; ");
  const _cookies: Record<string, string> = {};
  if (cookie) {
    for (const parts of cookie) {
      const cookieParts = parts.split("=");
      const _cookie = cookieParts.slice(1).join("=");
      const name = cookieParts[0];
      if (name) {
        _cookies[name] = _cookie;
      }
    }
  }

  if (cookieKey) {
    return _cookies[cookieKey];
  }
  return null;
}
