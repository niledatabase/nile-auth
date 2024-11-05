import { auth } from "@nile-auth/core";
import { handleFailure, queryByReq, formatTime } from "@nile-auth/query";
import { ResponseLogger } from "@nile-auth/logger";
import { NextRequest } from "next/server";

import { ErrorResultSet } from "@nile-auth/query";

/**
 * @swagger
 * /v2/databases/{database}/tenants/{tenantId}/users/{userId}:
 *   delete:
 *     tags:
 *     - users
 *     summary: deletes a user
 *     description: Deletes user sessions, and marks them deleted from the tenant. It does not remove the user from other tenants or invalidate active sessions.
 *     operationId: deleteTenantUser
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
 *       - name: userId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "204":
 *         description: The user was deleted
 *         content: {}
 *       "404":
 *         description: Not found
 *         content: {}
 *       "401":
 *         description: Unauthorized
 *         content: {}
 *     security:
 *     - sessionCookie: []
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { userId?: string; tenantId: string } },
) {
  const [session] = await auth(req);
  const responder = ResponseLogger(req);
  if (session && session?.user?.id) {
    if (!params.userId) {
      return handleFailure(req, undefined, "userid is required.");
    }
    if (!params.tenantId) {
      return handleFailure(req, undefined, "tenantId is required.");
    }

    const sql = await queryByReq(req);
    const existingSessionUser = await sql`
      SELECT
        COUNT(*)
      FROM
        users.tenant_users
      WHERE
        user_id = ${session.user.id}
        AND tenant_id = ${params.tenantId}
    `;
    if (
      existingSessionUser &&
      "rowCount" in existingSessionUser &&
      existingSessionUser.rowCount === 0
    ) {
      return responder(null, { status: 404 });
    }

    const body = await req.json();
    let userInTenant;
    if (body.email) {
      userInTenant = await sql`
        SELECT
          *
        FROM
          users.tenant_users
        WHERE
          email = ${decodeURIComponent(body.email)}
          AND tenant_id = ${params.tenantId}
      `;
    } else {
      userInTenant = await sql`
        SELECT
          *
        FROM
          users.tenant_users
        WHERE
          user_id = ${params.userId}
          AND tenant_id = ${params.tenantId}
      `;
    }
    if (
      userInTenant &&
      "rowCount" in userInTenant &&
      userInTenant.rowCount === 0
    ) {
      return responder(null, { status: 404 });
    }
    if (userInTenant && "name" in userInTenant) {
      return handleFailure(req, userInTenant as ErrorResultSet);
    }
    const user = userInTenant?.rows[0] ?? {};
    if (!user) {
      return responder(null, { status: 404 });
    }

    const users = await sql`
      UPDATE users.tenant_users
      SET
        deleted = ${formatTime()}
      WHERE
        user_id = ${String(user.user_id)}
        AND tenant_id = ${params.tenantId}
    `;
    if (users && "rows" in users) {
      return responder(null, { status: 204 });
    } else {
      return responder(null, { status: 404 });
    }
  }

  return responder(null, { status: 401 });
}

/**
 * @swagger
 * /v2/databases/{database}/tenants/{tenantId}/users/{userId}:
 *   put:
 *     tags:
 *     - users
 *     summary: update a user
 *     description: updates a user
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
  const responder = ResponseLogger(req);
  if (session && session?.user?.id) {
    if (!params.userId) {
      return handleFailure(req, undefined, "userId is required.");
    }
    if (!params.tenantId) {
      return handleFailure(req, undefined, "tenantId is required.");
    }
    const sql = await queryByReq(req);
    const userInTenant = await sql`
      SELECT
        COUNT(*)
      FROM
        users.tenant_users
      WHERE
        user_id = ${session.user.id}
        AND tenant_id = ${params.tenantId}
    `;
    if (
      userInTenant &&
      "rowCount" in userInTenant &&
      userInTenant.rowCount === 0
    ) {
      return responder(null, { status: 404 });
    }
    const body = await req.json();
    const [userData] = await Promise.all([
      await sql`
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
          id = ${params.userId}
      `,
    ]);
    if (userData && "rows" in userData) {
      if (userData.rowCount === 0) {
        return responder(null, { status: 404 });
      }

      const user = userData.rows[0] as {
        name: string;
        familyName: string;
        givenName: string;
        picture: string;
      };
      const updatedUser = await sql`
        UPDATE users.users
        SET
          name = ${body?.name ?? user.name},
          family_name = ${body?.familyName ?? user.familyName},
          given_name = ${body.givenName ?? user.givenName},
          picture = ${body.picture ?? user.picture}
        WHERE
          id = ${params.userId}
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
        return responder(
          JSON.stringify({
            ...updatedUser.rows[0],
          }),
          {
            status: 200,
          },
        );
      }
      if (updatedUser && "name" in updatedUser) {
        return handleFailure(
          req,
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
