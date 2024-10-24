import {
  AdapterSession,
  AdapterUser,
  AdapterAccount,
} from "next-auth/adapters";

export type NileSession = {
  session_token: string;
  user_id: string;
  expires_at: Date;
};

export type NileUser = {
  id: string;
  email: string;
  name: string;
  picture: string;
};
type NileAccount = {
  payload: {
    access_token: string;
    expires_at: number;
    id_token: string;
    refresh_token: string;
    scope: string;
    session_state: string;
    token_type: string;
    type: "oauth" | "email" | "credentials";
  };
  provider: string;
  provider_account_id: string;
  user_id: string;
};

export const convertSession = (
  row: void | NileSession,
): AdapterSession | void => {
  if (!row) {
    return undefined;
  }
  return {
    sessionToken: row.session_token,
    userId: row.user_id,
    expires: row.expires_at,
  };
};

export const convertUser = (row?: NileUser): null | AdapterUser => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    image: row.picture,
    email: row.email,
    emailVerified: null,
  };
};

export const convertAccount = (row: NileAccount): AdapterAccount => {
  const { payload } = row;
  const account = {
    userId: row.user_id,
    providerAccountId: row.provider_account_id,
    provider: row.provider,
    type: payload.type,
    access_token: payload.access_token,
    token_type: payload.token_type,
    refresh_token: payload.refresh_token,
    scope: payload.scope,
    expires_at: payload.expires_at,
    session_state: payload.session_state,
  };
  return account;
};
