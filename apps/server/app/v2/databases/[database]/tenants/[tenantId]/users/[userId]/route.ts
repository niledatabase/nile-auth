import { auth } from "@nile-auth/core";
import { queryByReq, formatTime, ErrorResultSet } from "@nile-auth/query";
import { Logger, EventEnum, ResponseLogger } from "@nile-auth/logger";
import { NextRequest } from "next/server";
import { addContext } from "@nile-auth/query/context";
import { handleFailure } from "@nile-auth/query/utils";

/**
 * @swagger
 * /v2/databases/{database}/tenants/{tenantId}/users/{userId}:
 *   put:
 *     tags:
 *     - users
 *     summary: update a user
 *     description: Updates a user, provided the authorized user is in the same tenant as that user
 *     operationId: updateTenantUser
 *     parameters:
 *       - name: database
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: userId
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
 *       content:
 *        application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUser'
 *     responses:
 *       "200":
 *         description: Identified user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TenantUser'
 *       "404":
 *         description: Not found
 *         content: {}
 *       "401":
 *         description: Unauthorized
 *         content: {}
 *     security:
 *     - sessionCookie: []
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { userId?: string; tenantId?: string } },
) {
  const [session] = await auth(req);
  const responder = ResponseLogger(req, EventEnum.UPDATE_TENANT_USER);
  if (session && session?.user?.id) {
    const { userId, tenantId } = params;
    if (!userId) {
      return handleFailure(responder, undefined, "userId is required.");
    }
    if (!tenantId) {
      return handleFailure(responder, undefined, "tenantId is required.");
    }
    const sql = await queryByReq(req);
    const [, , principalInTenant] = await sql`
      ${addContext({ tenantId })};

      ${addContext({ userId: session.user.id })};

      SELECT
        COUNT(*)
      FROM
        users.tenant_users
      WHERE
        deleted IS NULL
    `;
    if (
      principalInTenant &&
      "rowCount" in principalInTenant &&
      (Number(principalInTenant.rows[0]?.count) ?? 0) === 0
    ) {
      return responder(null, { status: 404 });
    }
    const [, , userInTenant] = await sql`
      ${addContext({ tenantId })};

      ${addContext({ userId })};

      SELECT
        COUNT(*)
      FROM
        users.tenant_users
      WHERE
        deleted IS NULL
    `;

    if (
      userInTenant &&
      "rowCount" in userInTenant &&
      (Number(userInTenant.rows[0]?.count) ?? 0) === 0
    ) {
      return responder(null, { status: 404 });
    }
    const [userData] = await sql`
      SELECT
        id,
        email,
        name,
        family_name AS "familyName",
        given_name AS "givenName",
        picture
      FROM
        users.users
      WHERE
        id = ${userId}
    `;
    if (userData && "rows" in userData) {
      if (userData.rowCount === 0) {
        return responder(null, { status: 404 });
      }

      const body = await req.json();
      const user = userData.rows[0] as {
        name: string;
        familyName: string;
        givenName: string;
        picture: string;
      };
      const [updatedUser] = await sql`
        UPDATE users.users
        SET
          name = ${body?.name ?? user.name},
          family_name = ${body?.familyName ?? user.familyName},
          given_name = ${body.givenName ?? user.givenName},
          picture = ${body.picture ?? user.picture}
        WHERE
          id = ${userId}
        RETURNING
          id,
          email,
          name,
          family_name AS "familyName",
          given_name AS "givenName",
          picture,
          created,
          updated
      `;

      if (updatedUser && "rowCount" in updatedUser) {
        return responder(JSON.stringify(updatedUser.rows[0]));
      }
      if (updatedUser && "name" in updatedUser) {
        return handleFailure(
          responder,
          updatedUser as ErrorResultSet,
          `User with email ${body.email}`,
        );
      }
    } else {
      return responder(null, { status: 404 });
    }
  }

  return responder(null, { status: 401 });
}
