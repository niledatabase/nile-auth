import { NextAuthOptions } from "next-auth";

import { Logger } from "@nile-auth/logger";

import { DbInfo } from "./types";
import { getProviders } from "./next-auth/getProviders";
import { defaultCookies, getSecureCookies } from "./next-auth/cookies";

const { error } = Logger("[next-auth-options]");

export async function nextOptions(req: Request, dbInfo: DbInfo) {
  const [providers, useJwt] = await getProviders(dbInfo).catch((e) => {
    error(e);
    return [[], false];
  });

  const useSecureCookies = getSecureCookies(req);
  const cookies = defaultCookies(useSecureCookies);
  const options: NextAuthOptions = {
    providers,
    cookies,
    debug: true,
  };
  if (useSecureCookies) {
    options.useSecureCookies = useSecureCookies;
  }

  if (useJwt) {
    options.session = {
      strategy: "jwt",
    };
  }
  return [options, useJwt];
}
