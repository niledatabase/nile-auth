import { UpdateDatabaseParams } from "./types";

export async function updateDatabase({
  sql,
  responseTokens,
  creds,
}: UpdateDatabaseParams) {
  await sql`
    UPDATE auth.credentials
    SET
      access_token = ${responseTokens.access_token},
      expires_at = ${Math.floor(Date.now() / 1000 + responseTokens.expires_in)},
      refresh_token = ${responseTokens.refresh_token ?? creds.refresh_token}
    WHERE
      provider = ${creds.provider}
      AND provider_account_id = ${creds.provider_account_id}
  `;
}
