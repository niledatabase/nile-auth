import { auth } from "@nile-auth/core";
import {
  getPasswordResetCookie,
  getSecureCookies,
} from "@nile-auth/core/cookies";
import { createHash } from "@nile-auth/core/csrf";
import { sendVerifyEmail } from "@nile-auth/core/providers/email";
import { EventEnum, ResponseLogger } from "@nile-auth/logger";
import { queryBySingle } from "@nile-auth/query";
import { NextRequest } from "next/server";

/**
 *
 * @swagger
 * /v2/databases/{database}/auth/verify-email:
 *   get:
 *     tags:
 *       - auth
 *     summary: Takes in an email verification token and ensures it is valid
 *     operationId: verifyEmail
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
 *       - name: callbackUrl
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
  const [responder, reporter] = ResponseLogger(req, EventEnum.VERIFY_EMAIL);
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const identifier = searchParams.get("identifier");
    const callbackUrl = searchParams.get("callbackUrl");
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
        status: 201,
        headers: {
          location: String(callbackUrl),
        },
      });
    }
    if (new Date(verificationToken?.expires) > new Date()) {
      await sql`
        UPDATE users.users
        SET
          email_verified = CURRENT_TIMESTAMP
        WHERE
          email = ${identifier}
          AND deleted IS NULL
      `;

      if (callbackUrl) {
        const headers = new Headers({ location: callbackUrl });
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

/**
 *
 * @swagger
 * /v2/databases/{database}/auth/verify-email:
 *   post:
 *     tags:
 *       - auth
 *     summary: Sends a verification email
 *     operationId: sendVerificationEmail
 *     parameters:
 *       - name: database
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               callbackUrl:
 *                 type: string
 *                 format: uri
 *                 description: URL the user is sent to after resetting
 *                 example: https://example.com/callback
 *               csrfToken:
 *                 type: string
 *                 description: CSRF protection token
 *               redirectUrl:
 *                 type: string
 *                 format: uri
 *                 description: Optional post-auth redirect
 *                 example: https://example.com/dashboard
 *             required:
 *               - email
 *     responses:
 *       "200":
 *         description: Token has been sent to the client via cookie, if possible
 *       "400":
 *         description: API/Database failures
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       "401":
 *         description: Unauthorized
 *         content: {}
 *       "404":
 *         description: Unable to find the verification token
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *
 */
export async function POST(req: NextRequest) {
  const [responder, reporter] = ResponseLogger(req, EventEnum.VERIFY_EMAIL);
  try {
    return await sendVerifyEmail({ req });
  } catch (e) {
    reporter.error(e);
    return responder(e instanceof Error ? e.message : "Internal server error", {
      status: 500,
    });
  }
}
