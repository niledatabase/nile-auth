import { EventEnum, ResponseLogger } from "@nile-auth/logger";
import { queryByReq, queryBySingle } from "@nile-auth/query";
import { NextRequest } from "next/server";

import { randomString } from "@nile-auth/core/utils";
import {
  generateEmailBody,
  sendEmail,
  Template,
  Variable,
} from "@nile-auth/core/providers/email";
import {
  createHash,
  getCookieParts,
  validCsrfToken,
} from "@nile-auth/core/csrf";
import {
  getCallbackCookie,
  getCookie,
  getPasswordResetCookie,
  getSecureCookies,
} from "@nile-auth/core/cookies";
import { ProviderMethods } from "@nile-auth/core";

/**
 *
 * @swagger
 * /v2/databases/{database}/auth/reset-password:
 *   post:
 *     tags:
 *       - auth
 *     summary: Reset password
 *     description: Sends an email for a user to reset their password
 *     operationId: generatePasswordToken
 *     parameters:
 *       - name: database
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *        content:
 *         application/json:
 *            schema:
 *              $ref: '#/components/schemas/PasswordTokenPayload'
 *     responses:
 *       "200":
 *         description: Nothing happened
 *       "201":
 *         description: Token created and email sent to user
 *       "400":
 *         description: API/Database failures
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       "404":
 *         description: Missing csrf
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       "401":
 *         description: Unauthorized
 *         content: {}
 */

export async function POST(req: NextRequest) {
  const [responder, reporter] = ResponseLogger(
    req,
    EventEnum.RESET_PASSWORD_POST,
  );
  try {
    const useSecureCookies = getSecureCookies(req);
    const callbackCookie = decodeURIComponent(
      String(getCookie(getCallbackCookie(useSecureCookies).name, req.headers)),
    ).replace(/\/$/, "");

    const callback = `${callbackCookie}/api/auth/reset-password`;

    const json = await req.json();

    const email = json.email;
    const callbackUrl = json.callbackUrl ?? callback;
    const redirectURL = json.redirectURL ?? callbackCookie;

    if (typeof email !== "string" || !email) {
      return responder("Email is required", { status: 400 });
    }
    const [hasValidToken] = await validCsrfToken(
      req,
      process.env.NEXTAUTH_SECRET,
    );

    if (!hasValidToken) {
      return responder(null, { status: 404 });
    }

    const sqlOne = await queryBySingle({ req, responder });
    const sqlMany = await queryByReq(req);

    const [variables] = await sqlMany`
      SELECT
        *
      FROM
        auth.template_variables
    `;

    const {
      rows: [user],
      error,
    } = await sqlOne`
      SELECT
        *
      FROM
        users.users
      WHERE
        email = ${email}
    `;

    // if we don't have a user, don't tell anyone
    if (!user) {
      return responder(null, { status: 200 });
    }
    if (error) {
      return error;
    }

    const [
      {
        rows: [template],
        error: templateError,
      },
      {
        rows: [server],
        error: serverError,
      },
    ] = await Promise.all([
      sqlOne`
        SELECT
          *
        FROM
          auth.email_templates
        WHERE
          name = 'password_reset'
      `,
      sqlOne`
        SELECT
          *
        FROM
          auth.email_servers
        ORDER BY
          created DESC
        LIMIT
          1
      `,
    ]);

    if (templateError) {
      return templateError;
    }
    if (serverError) {
      return serverError;
    }

    const FOUR_HOURS_FROM_NOW = new Date(
      Date.now() + 1000 * 60 * 60 * 4,
    ).toISOString();

    const newToken = randomString(32);

    const identifier = email;
    await sqlOne`
      INSERT INTO
        auth.verification_tokens (identifier, token, expires)
      VALUES
        (
          ${identifier},
          ${newToken},
          ${FOUR_HOURS_FROM_NOW}
        )
      ON CONFLICT (identifier) DO UPDATE
      SET
        token = EXCLUDED.token,
        expires = EXCLUDED.expires
    `;

    const searchParams = new URLSearchParams({
      token: newToken,
      identifier: identifier,
      callbackURL: callbackUrl,
    });

    const { from, body, subject } = await generateEmailBody({
      email: user?.email,
      username: user?.name,
      template: template as Template,
      variables:
        variables && "rows" in variables ? (variables.rows as Variable[]) : [],
      url: `${!redirectURL.startsWith("http://") ? `${callbackCookie}${redirectURL}` : redirectURL}?${searchParams.toString()}`,
    });

    await sendEmail({
      body,
      to: user.email,
      from,
      subject,
      url: String(server?.server),
    });
    return responder(null, { status: 201 });
  } catch (e) {
    reporter.error(e);
    return responder(e instanceof Error ? e.message : "Internal server error", {
      status: 500,
    });
  }
}

/**
 *
 * @swagger
 * /v2/databases/{database}/auth/reset-password:
 *   get:
 *     tags:
 *       - auth
 *     summary: Retrieve password token
 *     description: Responds to a link (probably in an email) by setting a cookie that allows for a password to be reset
 *     operationId: validatePasswordToken
 *     parameters:
 *       - name: database
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: token
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: identifier
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: callbackURL
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *
 *     responses:
 *       "200":
 *         description: Token has been sent to the client via cookie, if possible
 *       "400":
 *         description: API/Database failures
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       "404":
 *         description: Unable to find the verification token
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       "401":
 *         description: Unauthorized
 *         content: {}
 */
export async function GET(req: NextRequest) {
  const [responder, reporter] = ResponseLogger(
    req,
    EventEnum.RESET_PASSWORD_GET,
  );
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const identifier = searchParams.get("identifier");
    const callbackURL = searchParams.get("callbackURL");
    const sql = await queryBySingle({ req, responder });

    const {
      rows: [verificationToken],
      error,
    } = await sql`
      SELECT
        *
      FROM
        auth.verification_tokens
      WHERE
        identifier = ${identifier}
        AND token = ${token}
    `;

    if (error) {
      // in the case of an error, always redirect
      return responder(null, {
        status: 307,
        headers: {
          Location: String(callbackURL),
        },
      });
    }
    if (new Date(verificationToken?.expires) > new Date()) {
      if (callbackURL) {
        const headers = new Headers({ location: callbackURL });
        const useSecureCookies = getSecureCookies(req);
        const resetCookie = getPasswordResetCookie(useSecureCookies);
        const secureToken = await createHash(
          `${token}${identifier}${process.env.NEXTAUTH_SECRET}`,
        );

        const cookie = `${resetCookie.name}=${encodeURIComponent(`${token}|${secureToken}`)}; ${Object.keys(
          resetCookie.options,
        )
          .map((key: string) => {
            return `${key}=${resetCookie.options[key]}`;
          })
          .join("; ")}`;
        headers.set("Set-Cookie", cookie);
        return responder(null, { headers, status: 200 });
      }
    }

    return responder(null, { status: 200 });
  } catch (e) {
    reporter.error(e);
    return responder(e instanceof Error ? e.message : "Internal server error", {
      status: 500,
    });
  }
}

function getResetCookie(req: Request): string | null | undefined {
  const headers = new Headers(req.headers);
  const useSecureCookies = getSecureCookies(req);
  const resetCookie = getPasswordResetCookie(useSecureCookies);
  return getCookie(resetCookie.name, headers);
}

/**
 *
 * @swagger
 * /v2/databases/{database}/auth/reset-password:
 *   put:
 *     tags:
 *       - auth
 *     summary: Resets the password
 *     description: Based on a cookie, allows a user to reset their password
 *     operationId: resetPassword
 *     parameters:
 *       - name: database
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *        content:
 *         application/json:
 *            schema:
 *              $ref: '#/components/schemas/ResetPassword'
 *     responses:
 *       "200":
 *         description: Token has been sent to the client via cookie, if possible
 *       "400":
 *         description: API/Database failures
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       "404":
 *         description: Unable to find the verification token
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       "401":
 *         description: Unauthorized
 *         content: {}
 */

export async function PUT(req: NextRequest) {
  const [responder, reporter] = ResponseLogger(
    req,
    EventEnum.RESET_PASSWORD_DELETE,
  );
  try {
    const sql = await queryBySingle({ req, responder });

    const resetCookie = getResetCookie(req);
    const [token, resetTokenHash] = getCookieParts(resetCookie) ?? [];

    if (!token) {
      return responder("Missing token", { status: 400 });
    }
    const {
      rows: [identifier],
      error,
    } = await sql`
      SELECT
        *
      FROM
        auth.verification_tokens
      WHERE
        token = ${token}
    `;
    if (error) {
      return error;
    }
    const expectedToken = await createHash(
      `${token}${identifier?.identifier}${process.env.NEXTAUTH_SECRET}`,
    );

    const body = await req.json();

    // nice try
    if (
      expectedToken !== resetTokenHash ||
      !identifier?.identifier ||
      body.email?.trim().toLowerCase() !==
        identifier.identifier.trim().toLowerCase()
    ) {
      return responder("Unable to process request", { status: 400 });
    }

    if (new Date(identifier?.expires) < new Date()) {
      return responder("Token expired", { status: 400 });
    }
    // clean up the verification tokens, we have a good one for this identifier
    await sql`
      DELETE FROM auth.verification_tokens
      WHERE
        identifier = ${identifier.identifier}
    `;

    const {
      rows: [user],
      error: userError,
    } = await sql`
      SELECT
        *
      FROM
        users.users
      WHERE
        email = ${body.email}
    `;

    if (userError) {
      return userError;
    }

    // you can now reset your password
    await sql`
      UPDATE auth.credentials
      SET
        payload = jsonb_build_object(
          'crypt',
          'crypt-bf/8',
          'hash',
          public.crypt (
            ${body.password},
            public.gen_salt ('bf', 8)
          ),
          'email',
          ${body.email}::text
        )
      WHERE
        user_id = ${user?.id}
        AND method = ${ProviderMethods.EMAIL_PASSWORD}
      RETURNING
        *;
    `;

    return responder(null, { status: 204 });
  } catch (e) {
    reporter.error(e);
    return responder(e instanceof Error ? e.message : "Internal server error", {
      status: 500,
    });
  }
}
