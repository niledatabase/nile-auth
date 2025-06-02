import { auth } from "@nile-auth/core";
import { findCallbackCookie } from "@nile-auth/core/cookies";
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
 * post:
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
  const [responder, reporter] = ResponseLogger(
    req,
    EventEnum.INVITE_TENANT_USER,
  );
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
 *   get:
 *     tags:
 *       - tenants
 *     summary: List pending invites for a tenant
 *     description: Returns all pending invites for a given tenant, accessible by authenticated members of the tenant.
 *     operationId: listTenantInvites
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
 *     responses:
 *       '200':
 *         description: List of pending invites
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   tenant_id:
 *                     type: string
 *                     format: uuid
 *                   token:
 *                     type: string
 *                     description: Hashed invite token
 *                   identifier:
 *                     type: string
 *                     format: email
 *                   roles:
 *                     type: array
 *                     items:
 *                       type: string
 *                     nullable: true
 *                   created_by:
 *                     type: string
 *                     format: uuid
 *                     description: ID of the user who sent the invite
 *                   expires:
 *                     type: string
 *                     format: date-time
 *             example:
 *               - id: bd371f92-03e1-4862-9f6b-6d96d392ff18
 *                 tenant_id: 019731dc-2462-7615-8dc3-c9fd85e61966
 *                 token: 0007afb8bf432f8729491e1af35f03d111eb9a8105c0e9c3eebd8ca31585aed3
 *                 identifier: joseph@thenile.dev
 *                 roles: null
 *                 created_by: 019731dc-2440-7fd2-88b6-b233cc0e2695
 *                 expires: 2025-06-02T22:16:40.535Z
 *       '400':
 *         description: Bad request (e.g. missing tenantId or SQL failure)
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       '401':
 *         description: Unauthorized
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       '404':
 *         description: No invites found
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       '500':
 *         description: Internal server error
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *     security:
 *       - sessionCookie: []
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { database?: string; tenantId?: string } },
) {
  const [responder, reporter] = ResponseLogger(
    req,
    EventEnum.INVITE_TENANT_USER,
  );
  try {
    const [session] = await auth(req);
    if (session && session?.user?.id) {
      const { tenantId } = params;
      if (!tenantId) {
        return handleFailure(responder, undefined, "tenantId is required.");
      }
      const sql = await queryByReq(req);
      const [contextError, , tenants] = await sql`
        ${addContext({ tenantId })};

        ${addContext({ userId: session.user.id })};

        SELECT
          *
        FROM
          auth.invites;
      `;
      if (contextError && "name" in contextError) {
        return handleFailure(responder, contextError as ErrorResultSet);
      }

      if (tenants && "name" in tenants) {
        return handleFailure(responder, tenants as ErrorResultSet);
      }

      if (tenants && "rowCount" in tenants) {
        return responder(JSON.stringify(tenants.rows[0]));
      } else {
        return responder(null, { status: 404 });
      }
    }
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
) {
  const [responder, reporter] = ResponseLogger(
    req,
    EventEnum.INVITE_TENANT_USER_COMPLETE,
  );
  try {
    const [session] = await auth(req);
    if (session && session?.user?.id) {
      const { tenantId } = params;
      if (!tenantId) {
        return handleFailure(responder, undefined, "tenantId is required.");
      }

      const formData = await req.formData();
      const identifier = formData.get("identifier");
      const token = formData.get("token");

      if (typeof identifier !== "string") {
        return handleFailure(responder, undefined, "identifier is required.");
      }

      if (typeof token !== "string") {
        return handleFailure(responder, undefined, "token is not valid.");
      }

      const sql = await queryBySingle({ req, responder });
      const {
        rows: [invite],
        error: inviteError,
      } = await sql`
        SELECT
          *
        FROM
          auth.invites
        WHERE
          identifier = ${identifier}
          AND token = ${token}
      `;

      if (inviteError) {
        return responder(inviteError);
      }

      if (!invite) {
        return responder("Invalid invite.", { status: 404 });
      }
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

      const {
        rows: [newUser],
        error: createError,
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
          email_verified AS "emailVerified"
      `;
      await sql`
        DELETE FROM auth.invites
        WHERE
          id = ${invite.id}
      `;

      if (createError) {
        return responder(createError);
      }
      return responder(JSON.stringify(newUser), { status: 201 });
    }

    return responder(null, { status: 401 });
  } catch (e) {
    reporter.error(e);
    return responder(e instanceof Error ? e.message : "Internal server error", {
      status: 500,
    });
  }
}
export async function DELETE(req: NextRequest) {
  const [responder, reporter] = ResponseLogger(
    req,
    EventEnum.INVITE_TENANT_USER_COMPLETE,
  );
  try {
    const [session] = await auth(req);
  } catch (e) {
    reporter.error(e);
    return responder(e instanceof Error ? e.message : "Internal server error", {
      status: 500,
    });
  }
}
