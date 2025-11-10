# MFA Implementation Plan

This document captures the changes required to add multi-factor authentication (MFA) to Nile Auth while reusing existing NextAuth integrations and service patterns.

## Goals & Scope

- Enforce secondary verification for users that have `users.users.multi_factor` set to `authenticator` or `email`.
- Provide endpoints to let tenants enable, verify, and disable MFA for their users.
- Reuse current infrastructure (`auth.verification_tokens`, `auth.email_servers`, NextAuth adapter, cookie helpers) wherever possible.
- Support two factor types: TOTP authenticator apps (QR bootstrap, 30s window) and one-time passcodes delivered over email (120s window).

## Data Model Updates

- **`users.users`**: continue to use `multi_factor` as the switch that forces MFA at sign-in. Add columns (or reuse existing JSON metadata if available) for storing an encrypted authenticator secret plus timestamps (e.g. `mfa_authenticator_secret`, `mfa_verified_at`). Email MFA uses `multi_factor = 'email'` without additional data.
- Disabling MFA is handled by clearing `multi_factor` (and associated secrets) via the existing user profile update flows—no dedicated MFA API verb is required.
- **`auth.credentials`**: leverage the existing table to persist MFA details by introducing a new `method` (e.g. `MFA_AUTHENTICATOR`) whose JSON payload contains the encrypted secret, issuer, and backup codes. This record lives alongside the existing `EMAIL_PASSWORD` entry—password hashes stay where they are today, MFA secrets simply use a dedicated method to keep concerns separate.
- **`auth.verification_tokens`** (single source for challenges and OTPs):
  - Namespaced identifiers such as `mfa:setup:authenticator:<user_id>`, `mfa:challenge:authenticator:<user_id>`, `mfa:challenge:email:<user_id>`.
  - Use the `token` column for TOTP secrets or one-time codes, and `expires` to enforce time windows (30s for authenticator challenges, 120s for email).
  - Extend `packages/core/src/next-auth/adapter/createVerificationToken.ts` / `useVerificationToken.ts` only if we need per-namespace expiry overrides or JSON payload encoding.

## Service/API Surface

Expose a single Next.js route (`apps/server/app/v2/databases/[database]/auth/mfa`) handling setup and completion. The active MFA type is inferred from persisted configuration (`users.users.multi_factor` or a tenant-level override), so clients do not send `method`.

| Method           | Purpose                                                                                                                                                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/mfa` | Initiate MFA setup for the current user. Reads the target factor from configuration, generates the appropriate secret/OTP, stores it, and returns the bootstrap payload (e.g. otpauth URL, QR bytes, masked email).                                                                                                                                                 |
| `PUT /auth/mfa`  | Finalize MFA setup or satisfy a login challenge. Accepts the signed setup/challenge token plus the user-supplied code. On success, marks the factor verified, updates `multi_factor` as needed, and (for login flows triggered via NileAuth core) persists a session through the NextAuth adapter (`createSession`) so normal cookie issuance continues downstream. |

Implementation notes:

- Reuse cookie helpers from `packages/core/src/next-auth/cookies/index.ts` for secure cookie handling.
- Mirror error handling / logging patterns from `apps/server/app/v2/databases/[database]/auth/reset-password/route.ts`.
- Update `apps/server/app/v2/openapi/route.ts` to document request/response schemas for `POST` and `PUT`.
- Login-side challenges are generated inside NileAuth core (NextAuth callbacks) without calling `POST /auth/mfa`; the signed token handed to the client encodes the required action so `PUT /auth/mfa` can distinguish setup completion vs. login verification.
- Add Jest coverage similar to existing reset-password / verify-email tests, covering setup initiation and verification flows.

## NextAuth Integration

- Update `packages/core/src/types.ts` to include `ActionableErrors.mfaRequired`.
- Extend `packages/core/src/utils.ts`:
  - Add a `signIn` callback that checks `multi_factor` for the signing-in user (credentials + OIDC).
  - When MFA is required, create a challenge via shared helper (`packages/core/src/mfa/challenge.ts`), trigger any email OTP, and throw `new Error(ActionableErrors.mfaRequired)`.
  - Persist the challenge token via the shared `createChallengeToken` helper and return a structured payload for the route layer.
- Update `packages/core/src/index.ts` to intercept `mfaRequired` responses (similar to the `notVerified` branch) and respond with JSON `{ mfa: { token, expiresAt } }` and HTTP 401 so the UI knows to call `PUT /auth/mfa` with the signed token and user code. Determining whether the code should be TOTP or email-based comes from configuration, not the API payload.
- Guard credential login inside `packages/core/src/next-auth/providers/CredentialProvider.ts` to:
  - Generate MFA challenges post password verification (using shared helper, no additional API call required).
  - Skip issuing sessions until NileAuth core confirms the `PUT /auth/mfa` verification.
- Ensure SSO providers (Github, Google, etc.) funnel through the same `signIn` callback so that MFA is enforced regardless of provider.

## Shared MFA Helpers

- Create `packages/core/src/mfa/` with utilities:
  - `generateTotpSecret` / `formatOtpAuthUrl` using `otplib`.
  - `verifyTotpCode` with configurable window (default ±1, 30s step).
  - `storeAuthenticatorSecret` helper that persists the encrypted secret into `auth.credentials` (method `MFA_AUTHENTICATOR`).
  - `createChallengeToken` / `consumeChallengeToken` wrappers around `auth.verification_tokens` keyed by the action (`mfa:setup:<type>:<user_id>`, `mfa:challenge:<type>:<user_id>`), where `<type>` is resolved internally from configuration.
  - `sendMfaEmail` that wraps `packages/core/src/next-auth/providers/email.ts` logic to fetch templates (`mfa_email`), server, and call `sendEmail`.
- Add required dependencies (`otplib`, optionally `qrcode` if we render server-side) to the relevant package manifests.
- Wire helper usage both in the NextAuth callbacks and the new HTTP routes.

## Token Handling & Expiry

- The database sets expiry windows directly: challenges are inserted/updated with `expires = NOW() + INTERVAL '30 seconds'` for authenticator and `expires = NOW() + INTERVAL '2 minutes'` for email. Application code never hard-codes timestamps; it only reads the persisted value to confirm it is still in the future.
- Verification endpoints validate the stored `expires` column before accepting a code, and they always delete the associated `auth.verification_tokens` row—both on success and on any failure that should retire the challenge (invalid payload, method mismatch, bad OTP/MFA code, etc.)—so stale challenges do not linger.
- Periodic maintenance (existing cron/job) should continue clearing expired rows from `auth.verification_tokens` as an extra safety net.
- Rate-limit OTP regeneration (e.g. max 3 attempts per 10 minutes) by recording counters in the token identifier (`mfa:challenge:email:<user_id>:<attempt>`) or storing metadata in the JSON payload.

## Testing Strategy

- Unit tests for helper functions (`packages/core/src/mfa/__tests__`).
- Integration-style tests for each new route under `apps/server/.../auth/mfa` verifying success, expiration, bad codes, resend behavior.
- Credential provider tests ensuring `authorize` triggers MFA when `multi_factor` is set.
- Regression tests for existing sign-in flows to ensure non-MFA users still succeed.

## Rollout Checklist

1. Apply database migrations (new columns / enums, email template seed).
2. Deploy backend changes.
3. Roll client updates that handle MFA-required responses (UI prompts + challenge calls).
4. Monitor logs (`[credential provider]`, `[nile-auth]`) for `mfa` entries to ensure challenges are resolving.

## Open Questions

- Should TOTP secrets be encrypted using `pgcrypto` or KMS, and who holds the key?
- Do we also need SMS support or is email sufficient?
- What is the UX for backup codes / recovery if the authenticator device is lost?
- How should admins override/reset MFA for a user, and should that be exposed via API?
