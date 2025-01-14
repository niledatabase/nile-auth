import { NextAuthOptions } from "next-auth";

import { Logger } from "@nile-auth/logger";

import { DbInfo } from "./types";
import { getProviders } from "./next-auth/getProviders";
import { defaultCookies, getSecureCookies } from "./next-auth/cookies";
import { Provider as NextAuthProvider } from "next-auth/providers/index";
const { error } = Logger("[next-auth-options]");

export async function nextOptions(
  req: Request,
  dbInfo: DbInfo,
  tenantId?: null | string,
) {
  const [providers] = await getProviders(dbInfo, tenantId).catch((e) => {
    error(e);
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
    };
  }
  return [options];
}
