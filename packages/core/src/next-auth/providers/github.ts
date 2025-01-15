import { Params } from "./types";
import { updateDatabase } from "./utils";

export default async function handleGithubRefresh({
  party,
  sql,
  creds,
  user,
  provider,
}: Params) {
  const partyRow = party.rows[0];
  if (partyRow) {
    const searchParams = new URLSearchParams({
      client_id: partyRow.client_id,
      client_secret: partyRow.client_secret,
      grant_type: "refresh_token",
      refresh_token: creds.refresh_token,
    });
    const url = "https://github.com/login/oauth/access_token?" + searchParams;

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      method: "POST",
    });

    const responseTokens = await response.json();
    await updateDatabase({ sql, responseTokens, user, provider });
  }
}
