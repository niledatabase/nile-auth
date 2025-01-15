import { Primitive, ResultSet, ValidResultSet } from "@nile-auth/query";
import { User } from "next-auth";
import { Provider } from "../../types";

export type Creds = {
  provider: string;
  provider_account_id: string;
  payload: {
    access_token: string;
    refresh_token: string;
    expires_at: string;
  };
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
  creds: { refresh_token: string };
  provider: Provider;
  user: User;
};

export type UpdateDatabaseParams = {
  sql: (
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ) => Promise<ResultSet>;
  provider: Provider;
  user: User;
  responseTokens: {
    expires_in: number;
    access_token: string;
    refresh_token: string;
  };
};
