import { Params } from "./types";
import { updateDatabase } from "./utils";

export default async function handleGoogleRefresh({
  party,
  sql,
  creds,
  user,
  provider,
}: Params) {
  const partyRow = party.rows[0];
  if (partyRow) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: partyRow.client_id,
        client_secret: partyRow.client_secret,
        grant_type: "refresh_token",
        refresh_token: creds.refresh_token,
      }),
      method: "POST",
    });
    const responseTokens = await response.json();
    await updateDatabase({ sql, responseTokens, user, provider });
  }
}
