import { NextRequest } from "next/server";

import { EventEnum, Logger, ResponseLogger } from "@nile-auth/logger";
import { hasMultiFactorColumn, queryBySingle } from "@nile-auth/query";
import getDbInfo from "@nile-auth/query/getDbInfo";
import {
  verifyAuthenticatorToken,
  verifyEmailOtpToken,
  MultiFactorMethod,
  ChallengeScope,
  decryptAuthenticatorSecret,
  getMfaResponse,
  mfaIdentifier,
  SETUP_PREFIX,
  CHALLENGE_PREFIX,
  getChallengeScope,
} from "@nile-auth/core/mfa";
import {
  consumeRecoveryCode,
  StoredRecoveryCode,
} from "@nile-auth/core/mfa/recoveryKeys";
import {
  getSecureCookies,
  getSessionTokenCookie,
} from "@nile-auth/core/cookies";
import { maxAge } from "@nile-auth/core/nextOptions";
import { ProviderMethods } from "@nile-auth/core/types";
import { randomString } from "@nile-auth/core/utils";
import { auth } from "@nile-auth/core";
import { EmailError } from "@nile-auth/core/providers/email";
import { validCsrfToken } from "@nile-auth/core/csrf";

const log = Logger(EventEnum.MFA);

type StoredChallengePayload = {
  userId: string;
  method: MultiFactorMethod;
  otp?: string;
  length?: number;
};

type DisableMfaRequestBody = {
  token?: string;
  scope?: ChallengeScope;
  method?: MultiFactorMethod;
  code?: string;
  requireCode?: boolean;
};

type InitiateMfaRequestBody = {
  scope?: ChallengeScope;
  method?: MultiFactorMethod;
  forceSetup?: boolean;
};

/**
 *
 * @swagger
 * /v2/databases/{database}/auth/mfa:
 *   put:
 *     tags:
 *       - auth
 *     summary: Complete an MFA challenge
 *     description: >
 *       Validates the second-factor code that was issued during login or MFA setup. For login challenges,
 *       a new session cookie is issued when the supplied code is valid.
 *     operationId: verifyMfaChallenge
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - $ref: '#/components/parameters/database'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MfaVerifyRequest'
 *     responses:
 *       "200":
 *         description: MFA challenge was satisfied.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MfaVerifyResponse'
 *       "400":
 *         description: Invalid request payload or unsupported challenge.
 *         content:
 *           text/plain:
 *             schema:
 *               $ref: '#/components/schemas/APIError'
 *       "401":
 *         description: Provided MFA code was not valid.
 *         content:
 *           text/plain:
 *             schema:
 *               $ref: '#/components/schemas/APIError'
 *       "404":
 *         description: MFA challenge was not found.
 *         content:
 *           text/plain:
 *             schema:
 *               $ref: '#/components/schemas/APIError'
 *       "410":
 *         description: MFA challenge has expired.
 *         content:
 *           text/plain:
 *             schema:
 *               $ref: '#/components/schemas/APIError'
 *       "500":
 *         description: Unexpected server error.
 *         content:
 *           text/plain:
 *             schema:
 *               $ref: '#/components/schemas/APIError'
 */
export async function PUT(req: NextRequest) {
  const [responder, reporter] = ResponseLogger(req, EventEnum.MFA);

  try {
    const { token, scope, method, code } = await req.json();
    const [hasValidToken] = await validCsrfToken(
      req,
      process.env.NEXTAUTH_SECRET,
    );

    if (!hasValidToken) {
      // maybe make the client go get it
      return responder("Request blocked", { status: 400 });
    }
    const challengeMethod = method as MultiFactorMethod;
    const challengeScope = getChallengeScope(scope);
    const sql = await queryBySingle({ req, responder });
    const hasColumn = await hasMultiFactorColumn(sql);
    if (!hasColumn) {
      return responder(
        "Multi-factor authentication requires the latest database schema. Apply the pending migrations and try again.",
        { status: 503 },
      );
    }

    const identifier = mfaIdentifier(scope, token);

    const deleteChallenge = async () => {
      await sql`
        DELETE FROM auth.verification_tokens
        WHERE
          identifier = ${identifier}
      `;
    };

    const {
      rows: [tokenRow],
      error: tokenError,
    } = await sql<{
      identifier: string;
      token: string;
      expires: string;
    }>`
      SELECT
        identifier,
        token,
        expires
      FROM
        auth.verification_tokens
      WHERE
        identifier = ${identifier}
    `;

    if (tokenError) {
      return tokenError;
    }

    if (!tokenRow) {
      return responder("MFA challenge expired or missing", { status: 404 });
    }

    let parsedPayload: StoredChallengePayload;
    try {
      parsedPayload =
        typeof tokenRow.token === "string"
          ? (JSON.parse(tokenRow.token) as StoredChallengePayload)
          : (tokenRow.token as StoredChallengePayload);
    } catch (parseError) {
      await deleteChallenge();
      log.error("Unable to parse MFA challenge payload", {
        error: parseError,
        identifier,
      });
      return responder("Invalid MFA challenge payload", { status: 400 });
    }

    if (!parsedPayload?.userId || !parsedPayload.method) {
      await deleteChallenge();
      return responder("Malformed MFA challenge payload", { status: 400 });
    }

    const payloadMethod = parsedPayload.method as MultiFactorMethod;
    if (!Object.values(MultiFactorMethod).includes(payloadMethod)) {
      await deleteChallenge();
      return responder("Unsupported MFA method", { status: 400 });
    }

    if (challengeMethod && payloadMethod !== challengeMethod) {
      await deleteChallenge();
      return responder("MFA challenge method mismatch", { status: 400 });
    }

    if (new Date(tokenRow.expires) <= new Date()) {
      await deleteChallenge();
      return responder("MFA challenge has expired", { status: 410 });
    }

    let isValid = false;
    let usedRecoveryCode = false;
    let recoveryCodesRemaining: number | undefined;

    if (payloadMethod === MultiFactorMethod.Email) {
      if (typeof parsedPayload.otp !== "string") {
        await deleteChallenge();
        return responder("MFA challenge is missing email OTP", {
          status: 400,
        });
      }
      isValid = await verifyEmailOtpToken({
        otp: code,
        storedHash: parsedPayload.otp,
      });
    } else if (payloadMethod === MultiFactorMethod.Authenticator) {
      const {
        rows: [credential],
        error: credentialError,
      } = await sql<{
        id: string;
        payload: {
          secret?: string;
          totp_secret?: string;
          secret_encrypted?: string;
          recovery_codes?: StoredRecoveryCode[];
        };
      }>`
        SELECT
          id,
          payload
        FROM
          auth.credentials
        WHERE
          user_id = ${parsedPayload.userId}
          AND method = ${ProviderMethods.MFA}
          AND deleted IS NULL
        ORDER BY
          updated DESC
        LIMIT
          1
      `;

      if (credentialError) {
        return responder("Unable to verify passcode", { status: 404 });
      }

      const payload = credential?.payload ?? {};
      let secret = payload.secret ?? payload.totp_secret ?? null;

      if (!secret && typeof payload.secret_encrypted === "string") {
        try {
          secret = decryptAuthenticatorSecret(payload.secret_encrypted);
        } catch (error) {
          log.error("Failed to decrypt authenticator secret", {
            error:
              error instanceof Error
                ? { message: error.message, stack: error.stack }
                : error,
          });
          return responder("Unable to decrypt authenticator secret", {
            status: 500,
          });
        }
      }

      if (typeof secret !== "string" || secret.length === 0) {
        return responder("Authenticator secret is not configured", {
          status: 400,
        });
      }

      isValid = verifyAuthenticatorToken({
        secret,
        token: code,
      });

      if (!isValid) {
        const { consumed, remainingCodes } = await consumeRecoveryCode({
          code: code ?? "",
          recoveryCodes: payload.recovery_codes,
        });

        if (consumed) {
          usedRecoveryCode = true;
          recoveryCodesRemaining = remainingCodes.length;
          payload.recovery_codes = remainingCodes;

          if (credential?.id) {
            await sql`
              UPDATE auth.credentials
              SET
                payload = jsonb_set(
                  payload::jsonb,
                  '{recovery_codes}',
                  ${JSON.stringify(remainingCodes)}::jsonb,
                  TRUE
                )
              WHERE
                id = ${credential.id}
            `;
          }

          isValid = true;
        }
      }
    } else {
      await deleteChallenge();
      return responder("Unsupported MFA method", { status: 400 });
    }

    if (!isValid) {
      await deleteChallenge();
      return responder("Invalid MFA code", { status: 401 });
    }

    const {
      rows: [user],
      error: userError,
    } = await sql<{ id: string; email: string | null }>`
      SELECT
        id,
        email
      FROM
        users.users
      WHERE
        id = ${parsedPayload.userId}
        AND deleted IS NULL
    `;

    if (userError) {
      log.debug("no user");
      return userError;
    }

    if (!user) {
      await deleteChallenge();
      return responder("User no longer exists", { status: 404 });
    }

    if (challengeScope === ChallengeScope.Setup) {
      await sql`
        UPDATE users.users
        SET
          multi_factor = ${payloadMethod}
        WHERE
          id = ${parsedPayload.userId}
        RETURNING
          *;
      `;
    }

    const headers = new Headers();
    headers.set("content-type", "application/json");

    if (challengeScope === ChallengeScope.Challenge) {
      const expires = new Date(Date.now() + maxAge * 1000);
      const sessionToken = randomString(64);

      const {
        rows: [sessionRow],
        error: sessionError,
      } = await sql`
        INSERT INTO
          auth.sessions (user_id, session_token, expires_at)
        VALUES
          (
            ${parsedPayload.userId},
            ${sessionToken},
            ${expires.toISOString()}
          )
        RETURNING
          session_token
      `;

      if (sessionError) {
        return sessionError;
      }

      if (!sessionRow) {
        return responder("Unable to create session", { status: 500 });
      }

      const useSecureCookies = getSecureCookies(req);
      const sessionCookie = getSessionTokenCookie(useSecureCookies);

      const cookie = `${sessionCookie.name}=${encodeURIComponent(sessionToken)}; ${Object.entries(
        sessionCookie.options,
      )
        .map(([key, value]) => `${key}=${value}`)
        .join("; ")}; Max-Age=${maxAge}; Expires=${expires.toUTCString()}`;

      headers.set("Set-Cookie", cookie);
    }

    await deleteChallenge();

    const responsePayload: Record<string, unknown> = {
      ok: true,
      scope: challengeScope,
    };

    if (typeof recoveryCodesRemaining === "number" && usedRecoveryCode) {
      responsePayload.recoveryCodesRemaining = recoveryCodesRemaining;
    }

    return responder(JSON.stringify(responsePayload), {
      status: 200,
      headers,
    });
  } catch (error) {
    if (error instanceof EmailError) {
      log.warn("MFA email delivery failed", { message: error.message });
      reporter.error(error);
      return responder(error.message, { status: 400 });
    }
    if (error instanceof Error) {
      log.error("MFA verification failed", {
        message: error.message,
        stack: error.stack,
      });
    }
    reporter.error(error);
    return responder(
      error instanceof Error ? error.message : "Internal server error",
      {
        status: 500,
      },
    );
  }
}

/**
 *
 * @swagger
 * /v2/databases/{database}/auth/mfa:
 *   delete:
 *     tags:
 *       - auth
 *     summary: Disable MFA for the current user
 *     description: >
 *       Removes the user's active multi-factor credential. When `requireCode` is set or an email method
 *       is configured, the request must include a valid MFA code (and token for email) to confirm ownership.
 *     operationId: disableMfa
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - $ref: '#/components/parameters/database'
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MfaDisableRequest'
 *     responses:
 *       "200":
 *         description: MFA was disabled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MfaDisableResponse'
 *       "400":
 *         description: Invalid request payload or MFA is not enabled.
 *         content:
 *           text/plain:
 *             schema:
 *               $ref: '#/components/schemas/APIError'
 *       "401":
 *         description: User is not authenticated or provided code was invalid.
 *         content:
 *           text/plain:
 *             schema:
 *               $ref: '#/components/schemas/APIError'
 *       "403":
 *         description: Provided token does not match the current user.
 *         content:
 *           text/plain:
 *             schema:
 *               $ref: '#/components/schemas/APIError'
 *       "404":
 *         description: The user or challenge token could not be found.
 *         content:
 *           text/plain:
 *             schema:
 *               $ref: '#/components/schemas/APIError'
 *       "410":
 *         description: The provided challenge token has expired.
 *         content:
 *           text/plain:
 *             schema:
 *               $ref: '#/components/schemas/APIError'
 *       "500":
 *         description: Unexpected server error.
 *         content:
 *           text/plain:
 *             schema:
 *               $ref: '#/components/schemas/APIError'
 */
export async function DELETE(req: NextRequest) {
  const [responder, reporter] = ResponseLogger(req, EventEnum.MFA);

  try {
    const [session] = await auth(req);
    const sessionUser = session?.user;

    if (!sessionUser?.id) {
      return responder("Unauthorized", { status: 401 });
    }
    const [hasValidToken] = await validCsrfToken(
      req,
      process.env.NEXTAUTH_SECRET,
    );

    if (!hasValidToken) {
      // maybe make the client go get it
      return responder("Request blocked", { status: 400 });
    }
    let body: DisableMfaRequestBody = {};
    try {
      body = ((await req.json()) ?? {}) as DisableMfaRequestBody;
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        reporter.error(error);
        return responder("Invalid request body", { status: 400 });
      }
      if (error.message !== "Unexpected end of JSON input") {
        return responder("Invalid request body", { status: 400 });
      }
    }

    const { token, scope, method, code, requireCode } = body ?? {};

    const sql = await queryBySingle({ req, responder });
    const hasColumn = await hasMultiFactorColumn(sql);
    if (!hasColumn) {
      return responder(
        "Multi-factor authentication requires the latest database schema. Apply the pending migrations and try again.",
        { status: 503 },
      );
    }

    const {
      rows: [user],
      error: userError,
    } = await sql<{
      id: string;
      email: string | null;
      multi_factor: MultiFactorMethod | null;
    }>`
      SELECT
        id,
        email,
        multi_factor
      FROM
        users.users
      WHERE
        id = ${sessionUser.id}
        AND deleted IS NULL
    `;

    if (userError || !user) {
      log.debug("user not found");
      return userError;
    }

    const storedMethod = user.multi_factor as MultiFactorMethod | null;

    if (!storedMethod) {
      return responder("MFA is not enabled for this user", { status: 400 });
    }

    if (method && method !== storedMethod) {
      return responder("MFA challenge method mismatch", { status: 400 });
    }

    const shouldVerifyCode = Boolean(requireCode ?? code);
    let usedRecoveryCode = false;
    let recoveryCodesRemaining: number | undefined;

    if (requireCode && (typeof code !== "string" || code.trim().length === 0)) {
      return responder("MFA code is required to disable MFA", { status: 400 });
    }

    if (
      shouldVerifyCode &&
      (typeof code !== "string" || code.trim().length === 0)
    ) {
      return responder("MFA code is required to disable MFA", { status: 400 });
    }

    if (shouldVerifyCode) {
      const resolvedCode = code as string;

      if (storedMethod === MultiFactorMethod.Email) {
        if (typeof token !== "string" || token.trim().length === 0) {
          return responder("MFA challenge token is required", { status: 400 });
        }

        const identifier = mfaIdentifier(scope, token);

        const {
          rows: [tokenRow],
          error: tokenError,
        } = await sql<{
          identifier: string;
          token: string;
          expires: string;
        }>`
          SELECT
            identifier,
            token,
            expires
          FROM
            auth.verification_tokens
          WHERE
            identifier = ${identifier}
        `;

        if (tokenError) {
          log.debug(`Unable to find the token, ${identifier}`);
          return tokenError;
        }

        if (!tokenRow) {
          return responder("MFA challenge expired or missing", { status: 404 });
        }

        let parsedPayload: StoredChallengePayload;
        try {
          parsedPayload =
            typeof tokenRow.token === "string"
              ? (JSON.parse(tokenRow.token) as StoredChallengePayload)
              : (tokenRow.token as StoredChallengePayload);
        } catch (parseError) {
          log.error("Unable to parse MFA challenge payload", {
            error: parseError,
            identifier,
          });
          return responder("Invalid MFA challenge payload", { status: 400 });
        }

        if (parsedPayload.userId !== sessionUser.id) {
          return responder(
            "MFA challenge does not belong to the current user",
            {
              status: 403,
            },
          );
        }

        if (!parsedPayload?.userId || !parsedPayload.method) {
          return responder("Malformed MFA challenge payload", { status: 400 });
        }

        const payloadMethod = parsedPayload.method as MultiFactorMethod;
        if (!Object.values(MultiFactorMethod).includes(payloadMethod)) {
          return responder("Unsupported MFA method", { status: 400 });
        }

        if (payloadMethod !== storedMethod) {
          return responder("MFA challenge method mismatch", { status: 400 });
        }

        if (new Date(tokenRow.expires) <= new Date()) {
          return responder("MFA challenge has expired", { status: 410 });
        }

        if (typeof parsedPayload.otp !== "string") {
          return responder("MFA challenge is missing email OTP", {
            status: 400,
          });
        }

        const isValid = await verifyEmailOtpToken({
          otp: resolvedCode,
          storedHash: parsedPayload.otp,
        });

        if (!isValid) {
          return responder("Invalid MFA code", { status: 401 });
        }
      } else if (storedMethod === MultiFactorMethod.Authenticator) {
        const {
          rows: [credential],
          error: credentialError,
        } = await sql<{
          id: string;
          payload: {
            secret?: string;
            totp_secret?: string;
            secret_encrypted?: string;
            recovery_codes?: StoredRecoveryCode[];
          };
        }>`
          SELECT
            id,
            payload
          FROM
            auth.credentials
          WHERE
            user_id = ${sessionUser.id}
            AND method = ${ProviderMethods.MFA}
            AND deleted IS NULL
          ORDER BY
            updated DESC
          LIMIT
            1
        `;

        if (credentialError) {
          return credentialError;
        }

        const payload = credential?.payload ?? {};
        let secret = payload.secret ?? payload.totp_secret ?? null;

        if (!secret && typeof payload.secret_encrypted === "string") {
          try {
            secret = decryptAuthenticatorSecret(payload.secret_encrypted);
          } catch (error) {
            log.error("Failed to decrypt authenticator secret", {
              error:
                error instanceof Error
                  ? { message: error.message, stack: error.stack }
                  : error,
            });
            return responder("Unable to decrypt authenticator secret", {
              status: 500,
            });
          }
        }

        if (typeof secret !== "string" || secret.length === 0) {
          return responder("Authenticator secret is not configured", {
            status: 400,
          });
        }

        let isValid = verifyAuthenticatorToken({
          secret,
          token: resolvedCode,
        });

        if (!isValid) {
          const { consumed, remainingCodes } = await consumeRecoveryCode({
            code: resolvedCode,
            recoveryCodes: payload.recovery_codes,
          });

          if (consumed) {
            isValid = true;
            usedRecoveryCode = true;
            recoveryCodesRemaining = remainingCodes.length;
            payload.recovery_codes = remainingCodes;

            if (credential?.id) {
              await sql`
                UPDATE auth.credentials
                SET
                  payload = jsonb_set(
                    payload::jsonb,
                    '{recovery_codes}',
                    ${JSON.stringify(remainingCodes)}::jsonb,
                    TRUE
                  )
                WHERE
                  id = ${credential.id}
              `;
            }
          }
        }

        if (!isValid) {
          return responder("Invalid MFA code", { status: 401 });
        }
      } else {
        return responder("Unsupported MFA method", { status: 400 });
      }
    }

    await sql`
      DELETE FROM auth.verification_tokens
      WHERE
        (
          identifier LIKE ${`${CHALLENGE_PREFIX}%`}
          OR identifier LIKE ${`${SETUP_PREFIX}%`}
        )
        AND token::jsonb ->> 'userId' = ${sessionUser.id}
    `;

    await sql`
      DELETE FROM auth.credentials
      WHERE
        user_id = ${sessionUser.id}
        AND method = ${ProviderMethods.MFA}
    `;

    const {
      rows: [updatedUser],
      error: updateError,
    } = await sql<{ id: string }>`
      UPDATE users.users
      SET
        multi_factor = NULL
      WHERE
        id = ${sessionUser.id}
      RETURNING
        id
    `;

    if (updateError) {
      return updateError;
    }

    if (!updatedUser) {
      return responder("User no longer exists", { status: 404 });
    }

    const payload: Record<string, unknown> = {
      ok: true,
      method: storedMethod,
    };

    if (typeof recoveryCodesRemaining === "number" && usedRecoveryCode) {
      payload.recoveryCodesRemaining = recoveryCodesRemaining;
    }

    return responder(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  } catch (error) {
    if (error instanceof EmailError) {
      log.warn("MFA email delivery failed", { message: error.message });
      reporter.error(error);
      return responder(error.message, { status: 400 });
    }
    if (error instanceof Error) {
      log.error("MFA disable failed", {
        message: error.message,
        stack: error.stack,
      });
    }
    reporter.error(error);
    return responder(
      error instanceof Error ? error.message : "Internal server error",
      {
        status: 500,
      },
    );
  }
}

/**
 *
 * @swagger
 * /v2/databases/{database}/auth/mfa:
 *   post:
 *     tags:
 *       - auth
 *     summary: Initiate MFA setup
 *     description: Begins the multi-factor enrollment flow for the signed-in user by issuing a setup challenge and, when applicable, returning authenticator bootstrap data.
 *     operationId: initiateMfaSetup
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - $ref: '#/components/parameters/database'
 *     responses:
 *       "201":
 *         description: MFA setup challenge created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MfaSetupResponse'
 *       "400":
 *         description: MFA setup is not enabled for this user or the request cannot be processed.
 *         content:
 *           text/plain:
 *             schema:
 *               $ref: '#/components/schemas/APIError'
 *       "401":
 *         description: User is not authenticated.
 *         content:
 *           text/plain:
 *             schema:
 *               $ref: '#/components/schemas/APIError'
 *       "500":
 *         description: Unexpected server error.
 *         content:
 *           text/plain:
 *             schema:
 *               $ref: '#/components/schemas/APIError'
 */
export async function POST(req: NextRequest) {
  const [responder, reporter] = ResponseLogger(req, EventEnum.MFA);
  try {
    const [session] = await auth(req);
    const sessionUser = session?.user;

    if (!sessionUser?.id) {
      return responder("Unauthorized", { status: 401 });
    }
    const [hasValidToken] = await validCsrfToken(
      req,
      process.env.NEXTAUTH_SECRET,
    );

    if (!hasValidToken) {
      // maybe make the client go get it
      return responder("Request blocked", { status: 400 });
    }
    let body: InitiateMfaRequestBody = {};
    try {
      if (req.headers.get("content-type")?.includes("application/json")) {
        body = ((await req.json()) ?? {}) as InitiateMfaRequestBody;
      }
    } catch (error) {
      if (
        !(error instanceof SyntaxError) ||
        error.message !== "Unexpected end of JSON input"
      ) {
        return responder("Invalid request body", { status: 400 });
      }
    }

    const scopeCandidate = body.scope;
    const methodCandidate = body.method;
    const normalizedScope =
      typeof scopeCandidate === "string" &&
      (Object.values(ChallengeScope) as string[]).includes(scopeCandidate)
        ? (scopeCandidate as ChallengeScope)
        : undefined;

    const shouldForceSetup =
      typeof body.forceSetup === "boolean"
        ? body.forceSetup
        : normalizedScope === ChallengeScope.Setup
          ? true
          : normalizedScope === ChallengeScope.Challenge
            ? false
            : false;

    const dbInfo = getDbInfo(undefined, req);
    const resolvedConfig =
      methodCandidate &&
      Object.values(MultiFactorMethod).includes(methodCandidate)
        ? {
            authenticator: methodCandidate === MultiFactorMethod.Authenticator,
            email: methodCandidate === MultiFactorMethod.Email,
          }
        : {
            authenticator: true,
            email: true,
          };
    const result = await getMfaResponse({
      req,
      dbInfo,
      userId: sessionUser.id,
      config: resolvedConfig,
      forceSetup: shouldForceSetup,
    });

    if (!result) {
      return responder(
        shouldForceSetup
          ? "MFA is not enabled for this user"
          : "No MFA challenge available",
        { status: 400 },
      );
    }

    if (
      normalizedScope === ChallengeScope.Challenge &&
      result.scope !== ChallengeScope.Challenge
    ) {
      return responder("MFA challenge is not available for this user", {
        status: 400,
      });
    }

    const headers = {
      "content-type": "application/json",
    };

    const payload = {
      ok: true,
      ...result,
    };
    const status = result.scope === ChallengeScope.Setup ? 201 : 200;

    return responder(JSON.stringify(payload), {
      status,
      headers,
    });
  } catch (error) {
    if (error instanceof EmailError) {
      log.warn("MFA email delivery failed", { message: error.message });
      reporter.error(error);
      return responder(error.message, { status: 400 });
    }
    if (error instanceof Error) {
      log.error("MFA setup failed", {
        message: error.message,
        stack: error.stack,
      });
    }
    reporter.error(error);
    return responder(
      error instanceof Error ? error.message : "Internal server error",
      {
        status: 500,
      },
    );
  }
}
