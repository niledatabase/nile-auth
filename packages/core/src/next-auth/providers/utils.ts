import { UpdateDatabaseParams } from "./types";

export async function updateDatabase({
  sql,
  responseTokens,
  user,
  provider,
}: UpdateDatabaseParams) {
  const cred = await sql`
    SELECT
      *
    FROM
      auth.credentials
    WHERE
      user_id = ${user.id}
      AND provider = ${provider.name}
  `;
  if (cred && "rows" in cred) {
    const existingPayload: void | JSON = cred?.rows?.[0]
      ?.payload as unknown as JSON;
    const fullPayload = {
      ...(existingPayload ? existingPayload : {}),
      access_token: responseTokens.access_token,
      expires_at: Math.floor(Date.now() / 1000 + responseTokens.expires_in),
      refresh_token: responseTokens.refresh_token,
    };
    const payload = JSON.stringify(fullPayload);

    // if we have an access token response, update, else leave it alone
    if ("access_token" in responseTokens) {
      await sql`
        UPDATE auth.credentials
        SET
          payload = ${payload}
        WHERE
          provider = ${provider.name}
          AND user_id = ${user.id}
      `;
    }
  }
}
