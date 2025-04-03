import { NextAuthOptions } from "next-auth";

import { Logger } from "@nile-auth/logger";

import { DbInfo } from "./types";
import { getProviders } from "./next-auth/getProviders";
import { defaultCookies, getSecureCookies } from "./next-auth/cookies";
import { Provider as NextAuthProvider } from "next-auth/providers/index";
const { warn } = Logger("[next-auth-options]");

export const maxAge = 30 * 24 * 60 * 60; // Sessions expire after 30 days of being idle by default

export async function nextOptions(
  req: Request,
  dbInfo: DbInfo,
  tenantId?: null | string,
) {
  const [providers] = await getProviders(dbInfo, tenantId).catch((e) => {
    warn("provider fetch failed", { stack: e.stack, message: e.message });
    return [[]];
  });

  const useSecureCookies = getSecureCookies(req);
  const cookies = defaultCookies(useSecureCookies);
  const options: Omit<NextAuthOptions, "providers"> & {
    providers: null | NextAuthProvider[];
  } = {
    providers,
    cookies,
    debug: true,
  };
  if (useSecureCookies) {
    options.useSecureCookies = useSecureCookies;
  }

  const url = new URL(req.url);
  if (url.pathname.endsWith("/credentials")) {
    options.session = {
      strategy: "jwt",
      maxAge,
    };
  }
  return [options];
}
