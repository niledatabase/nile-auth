import { auth } from "@nile-auth/core";
import { findCallbackCookie, getCallbackCookie } from "@nile-auth/core/cookies";
import { validCsrfToken } from "@nile-auth/core/csrf";
import {
  checkEmail,
  sendTenantUserInvite,
} from "@nile-auth/core/providers/email";
import { EventEnum, ResponseLogger } from "@nile-auth/logger";
import { ErrorResultSet, queryByReq, queryBySingle } from "@nile-auth/query";
import { addContext } from "@nile-auth/query/context";
import { handleFailure } from "@nile-auth/query/utils";
import { NextRequest } from "next/server";

/**
 * @swagger
 * /v2/databases/{database}/tenants/{tenantId}/invite:
 *  post:
 *   tags:
 *     - tenants
 *   summary: Invite a user to a tenant
 *   description: Allows an authenticated tenant member to invite another user via email. The invitee will receive an email and must accept the invitation.
 *   operationId: inviteUserToTenant
 *   parameters:
 *     - name: database
 *       in: path
 *       required: true
 *       schema:
 *         type: string
 *     - name: tenantId
 *       in: path
 *       required: true
 *       schema:
 *         type: string
 *   requestBody:
 *     required: true
 *     content:
 *       multipart/form-data:
 *         schema:
 *           type: object
 *           required:
 *             - identifier
 *             - csrfToken
 *             - redirectUrl
 *             - callbackUrl
 *           properties:
 *             identifier:
 *               type: string
 *               format: email
 *               description: Email address of the user being invited
 *             csrfToken:
 *               type: string
 *               description: CSRF token for request validation
 *             redirectUrl:
 *               type: string
 *               format: uri
 *               description: URL to redirect the user to after accepting the invite
 *             callbackUrl:
 *               type: string
 *               format: uri
 *               description: Callback URL to include in the invitation email
 *   responses:
 *     '200':
 *       description: Invite sent successfully
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 example: success
 *               message:
 *                 type: string
 *                 example: Invite email sent
 *     '400':
 *       description: Bad request (validation failure, missing fields, or bad CSRF token)
 *       content:
 *         text/plain:
 *           schema:
 *             type: string
 *     '401':
 *       description: Unauthorized (missing or invalid session)
 *       content:
 *         text/plain:
 *           schema:
 *             type: string
 *     '404':
 *       description: Tenant not found
 *       content:
 *         text/plain:
 *           schema:
 *             type: string
 *     '500':
 *       description: Internal server error
 *       content:
 *         text/plain:
 *           schema:
 *             type: string
 *   security:
 *     - sessionCookie: []
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { database?: string; tenantId?: string } },
) {
  const [responder, reporter] = ResponseLogger(req, EventEnum.CREATE_INVITE);
  try {
    const [session] = await auth(req);
    if (session && session?.user?.id) {
      const { tenantId } = params;
      if (!tenantId) {
        return handleFailure(responder, undefined, "tenantId is required.");
      }

      const formData = await req.formData();
      const identifier = formData.get("identifier");

      if (typeof identifier !== "string") {
        return handleFailure(responder, undefined, "identifier is required.");
      }
      const validEmail = checkEmail(identifier);

      if (!validEmail) {
        return handleFailure(responder, undefined, "email is not valid.");
      }

      const csrfToken = formData.get("csrfToken");
      const [hasValidToken, csrf] = await validCsrfToken(
        req,
        process.env.NEXTAUTH_SECRET,
      );
      if (!hasValidToken || csrf !== csrfToken) {
        return responder("Request blocked", { status: 400 });
      }

      const redirectUrl = String(formData.get("redirectUrl"));
      let callbackUrl: string = String(formData.get("callbackUrl"));

      if (!callbackUrl) {
        try {
          const callbackCookie = findCallbackCookie(req);
          callbackUrl = new URL(callbackCookie).toString();
        } catch (e) {
          return responder("Callback is not a valid url", { status: 400 });
        }
      }
      try {
        return sendTenantUserInvite({
          req,
          responder,
          tenantId,
          userId: session.user.id,
          json: { identifier, callbackUrl, redirectUrl },
        });
      } catch {
        return responder(
          "Unable to send invite email. Check your configuration",
          { status: 400 },
        );
      }
    }

    return responder(null, { status: 401 });
  } catch (e) {
    reporter.error(e);
    return responder(e instanceof Error ? e.message : "Internal server error", {
      status: 500,
    });
  }
}

/**
 * @swagger
 * /v2/databases/{database}/tenants/{tenantId}/invite:
 *   put:
 *     tags:
 *       - tenants
 *     summary: Accepts a tenant invite
 *     description: Accepts an invite for a user to join a tenant using the token and email. The invite must be valid and not expired.
 *     operationId: acceptTenantInvite
 *     parameters:
 *       - name: database
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: tenantId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *               - token
 *               - callbackUrl
 *             properties:
 *               identifier:
 *                 type: string
 *                 format: email
 *               token:
 *                 type: string
 *               callbackUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       "201":
 *         description: Successfully created the user and accepted the invite
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 email:
 *                   type: string
 *                 name:
 *                   type: string
 *                   nullable: true
 *                 familyName:
 *                   type: string
 *                   nullable: true
 *                 givenName:
 *                   type: string
 *                   nullable: true
 *                 picture:
 *                   type: string
 *                   format: uri
 *                   nullable: true
 *                 created:
 *                   type: string
 *                   format: date-time
 *                 updated:
 *                   type: string
 *                   format: date-time
 *                 emailVerified:
 *                   type: string
 *                   format: date-time
 *       "400":
 *         description: Missing or invalid data (e.g., invalid token, malformed email, bad callback URL)
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       "401":
 *         description: Unauthorized
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       "403":
 *         description: Inviter is no longer a member of the tenant
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       "404":
 *         description: Invite not found
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       "410":
 *         description: Invite has expired
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       "500":
 *         description: Internal server error
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *     security:
 *       - sessionCookie: []
 */

export async function PUT(
  req: NextRequest,
  { params }: { params: { database?: string; tenantId?: string } },
): Promise<Response> {
  const [responder, reporter] = ResponseLogger(req, EventEnum.ACCEPT_INVITE);
  try {
    const { tenantId } = params;
    if (!tenantId) {
      return handleFailure(responder, undefined, "tenantId is required.");
    }

    const formData = await req.formData();
    const identifier = formData.get("identifier");
    const token = formData.get("token");
    const cbUrl = formData.get("callbackUrl");
    const callbackCookie = findCallbackCookie(req);

    let callbackUrl: URL | undefined;

    try {
      const raw = typeof cbUrl === "string" ? cbUrl : callbackCookie;

      try {
        callbackUrl = new URL(raw);
      } catch {
        // relative path
        const baseSource =
          typeof cbUrl === "string" && cbUrl.startsWith("http")
            ? new URL(cbUrl)
            : typeof callbackCookie === "string" &&
                callbackCookie.startsWith("http")
              ? new URL(callbackCookie)
              : null;

        if (!baseSource) {
          return responder("Invalid callback url: missing base", {
            status: 400,
          });
        }

        callbackUrl = new URL(raw, baseSource.origin);
      }
    } catch {
      return responder("Invalid callback url", { status: 400 });
    }

    if (typeof identifier !== "string") {
      return handleFailure(responder, undefined, "identifier is required.");
    }

    if (typeof token !== "string") {
      return handleFailure(responder, undefined, "token is not valid.");
    }

    const sqlMany = await queryByReq(req);
    const sql = await queryBySingle({ req, responder });
    const [inviteContextError, possibleInvite] = await sqlMany`
      ${addContext({ tenantId })};

      SELECT
        *
      FROM
        auth.invites
      WHERE
        identifier = ${identifier}
        AND token = ${token}
    `;

    if (possibleInvite && "name" in possibleInvite) {
      return handleFailure(responder, possibleInvite as ErrorResultSet);
    }
    const invite =
      possibleInvite && "rows" in possibleInvite
        ? possibleInvite.rows[0]
        : null;

    if (
      !invite ||
      typeof invite.id !== "string" ||
      typeof invite.created_by !== "string"
    ) {
      return responder("Invite not found", { status: 404 });
    }

    if (!invite || inviteContextError) {
      return responder("Invalid invite.", {
        status: 404,
        headers: {
          location: `http://localhost:3000/invites?error=Invalid invite`,
        },
      });
    }
    await sql`
      ${addContext({ tenantId })};

      DELETE FROM auth.invites
      WHERE
        id = ${invite.id}
    `;

    if (invite.expires && new Date(invite.expires) < new Date()) {
      return responder("Invite has expired.", { status: 410 });
    }
    const {
      rows: [activeUser],
      error: activeUserError,
    } = await sql`
      SELECT
        *
      FROM
        users.tenant_users
      WHERE
        user_id = ${invite.created_by}
        AND tenant_id = ${tenantId}
    `;

    if (activeUserError) {
      return responder(activeUserError);
    }

    if (!activeUser) {
      return responder("Inviter is no longer a member of this tenant.", {
        status: 403,
      });
    }

    // check if the user exists.
    // if so, their email is verified (if it isn't)
    // else we create a new user. They don't have any way to log in :sad:, so they'll need a way.
    const {
      rows: [newUser],
      error: insertError,
    } = await sql`
      INSERT INTO
        users.users (email, email_verified)
      VALUES
        (
          ${identifier},
          CURRENT_TIMESTAMP
        )
      RETURNING
        id,
        email,
        name,
        family_name AS "familyName",
        given_name AS "givenName",
        picture,
        created,
        updated,
        email_verified AS "emailVerified",
        multi_factor AS "multiFactor"
    `;

    let userId = newUser?.id;
    let email = identifier;
    // in this case, the error would be a key constraint on the user, which means they already exist
    if (insertError instanceof Response) {
      const text = await insertError.clone().text();
      if (!text.startsWith("duplicate key")) {
        return insertError;
      }
      const {
        rows: [user],
        error: userError,
      } = await sql`
        SELECT
          *
        FROM
          users.users
        WHERE
          email = ${identifier}
      `;
      if (userError) {
        return userError;
      }
      userId = user?.id;
      email = user?.email;
    }
    if (!userId) {
      return responder("Unable to obtain user id from database.", {
        status: 400,
      });
    }

    // since they accepted the invite, their email is verified.
    await sql`
      UPDATE users.users
      SET
        email_verified = CURRENT_TIMESTAMP
      WHERE
        email = ${email}
        AND deleted IS NULL
    `;
    const { error: userInsertError } = await sql`
      INSERT INTO
        users.tenant_users (tenant_id, user_id, email)
      VALUES
        (
          ${tenantId},
          ${userId},
          ${email}
        )
      RETURNING
        *
    `;
    if (userInsertError) {
      const errorText = await userInsertError.clone().text();
      const error = errorText.startsWith("duplicate")
        ? encodeURIComponent("User is already a member of the tenant")
        : errorText;
      callbackUrl.searchParams.set("error", error);
      return responder(null, {
        status: 400,
        headers: {
          location: callbackUrl.toString(),
        },
      });
    }
    return responder(null, {
      status: 204,
      headers: {
        location: callbackUrl.toString(),
      },
    });
  } catch (e) {
    reporter.error(e);
    return responder(e instanceof Error ? e.message : "Internal server error", {
      status: 500,
    });
  }
}
