-- PostgreSQL fixture for user-creation HTTP tests. Keep the column types,
-- indexes and constraints used by these flows aligned with Nile's auth schema.
-- This exercises real SQL, but does not emulate Nile's native tenant isolation.
CREATE EXTENSION pgcrypto;
CREATE SCHEMA users;
CREATE SCHEMA auth;

CREATE TYPE public.authentication_method AS ENUM (
  'EMAIL_PASSWORD', 'OIDC', 'PASSWORD', 'PLAIN_TEXT', 'MFA'
);

CREATE TABLE users.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created timestamp NOT NULL DEFAULT LOCALTIMESTAMP,
  updated timestamp NOT NULL DEFAULT LOCALTIMESTAMP,
  deleted timestamp,
  name text,
  family_name text,
  given_name text,
  email text,
  picture text,
  email_verified timestamp,
  multi_factor text
);
CREATE UNIQUE INDEX users_email_key ON users.users (email) WHERE deleted IS NULL;

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  created timestamp NOT NULL DEFAULT LOCALTIMESTAMP,
  updated timestamp NOT NULL DEFAULT LOCALTIMESTAMP,
  deleted timestamp,
  compute_id uuid
);

CREATE TABLE users.tenant_users (
  tenant_id uuid NOT NULL REFERENCES public.tenants,
  user_id uuid NOT NULL,
  created timestamp NOT NULL DEFAULT LOCALTIMESTAMP,
  updated timestamp NOT NULL DEFAULT LOCALTIMESTAMP,
  deleted timestamp,
  roles text[],
  email text,
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE auth.credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users.users,
  created timestamp NOT NULL DEFAULT LOCALTIMESTAMP,
  updated timestamp NOT NULL DEFAULT LOCALTIMESTAMP,
  deleted timestamp,
  method public.authentication_method NOT NULL,
  provider text NOT NULL DEFAULT 'nile',
  payload jsonb,
  provider_account_id text
);

CREATE TABLE auth.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users.users ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE auth.oidc_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  deleted timestamp,
  config jsonb
);
CREATE TABLE auth.oidc_relying_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider uuid NOT NULL REFERENCES auth.oidc_providers,
  client_id text NOT NULL,
  client_secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  deleted timestamp,
  config jsonb
);
CREATE TABLE auth.tenant_oidc_relying_parties (
  tenant_id uuid NOT NULL REFERENCES public.tenants,
  provider_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (tenant_id, provider_name)
);
INSERT INTO auth.oidc_providers (name, enabled) VALUES ('Credentials', true);
