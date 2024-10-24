import { Primitive, ResultSet, ValidResultSet } from "@nile-auth/query";

export type Creds = {
  provider: string;
  provider_account_id: string;
  refresh_token: string;
  expires_at: string;
};

export type PartyResultSet = ValidResultSet<
  {
    client_id: string;
    client_secret: string;
  }[]
>;
export type Params = {
  sql: (
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ) => Promise<ResultSet>;
  party: PartyResultSet;
  creds: Creds;
};

export type UpdateDatabaseParams = {
  sql: (
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ) => Promise<ResultSet>;
  creds: Creds;
  responseTokens: {
    expires_in: number;
    access_token: string;
    refresh_token: string;
  };
};
