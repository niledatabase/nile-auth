import { auth } from "@nile-auth/core";
import { Logger, EventEnum, ResponseLogger } from "@nile-auth/logger";
import { ErrorResultSet, formatTime, queryByReq } from "@nile-auth/query";
import { addContext } from "@nile-auth/query/context";
import { handleFailure } from "@nile-auth/query/utils";
import { NextRequest } from "next/server";

/**
 *
 * @swagger
 * /v2/databases/{database}/tenants/{tenantId}/users/{userId}/link:
 *   put:
 *     tags:
 *       - users
 *     summary: links an existing user to a tenant
 *     description: A user that already exists is added to a tenant
 *     operationId: linkTenantUser
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
 *       "201":
 *         description: update an existing tenant
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/TenantUser"
 *       "400":
 *         description: API/Database failures
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
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
  {
    params,
  }: { params: { database?: string; tenantId?: string; userId?: string } },
) {
  const [session] = await auth(req);
  const responder = ResponseLogger(req, EventEnum.LINK_USER);
  if (session && session?.user?.id) {
    const { tenantId, userId } = params ?? {};
    if (!tenantId) {
      return handleFailure(req, undefined, "tenantId is required.");
    }
    const sql = await queryByReq(req);

    if (!userId) {
      return new Response("User id is required.", { status: 400 });
    }

    const [newUser] = await sql`
      SELECT
        *
      FROM
        users.users
      WHERE
        id = ${userId}
    `;
    if (
      !newUser ||
      (newUser && "rowCount" in newUser && newUser.rowCount === 0)
    ) {
      return responder(null, { status: 404 });
    }
    if ("name" in newUser) {
      return handleFailure(req, newUser as ErrorResultSet);
    }
    const user = newUser.rows[0] as { id: string; email: string };
    // would be good to consolidate these into a single `client` at some point
    const [, , exists] = await sql`
      ${addContext({ tenantId })};

      ${addContext({ userId: session.user.id })};

      SELECT
        *
      FROM
        users.tenant_users
      WHERE
        user_id = ${user.id};
    `;

    if (exists && "name" in exists) {
      return handleFailure(req, exists as ErrorResultSet);
    }

    if (exists && "rowCount" in exists && exists.rowCount > 0) {
      const [, tenantUser] = await sql`
        ${addContext({ tenantId })};

        UPDATE users.tenant_users
        SET
          deleted = NULL
        WHERE
          user_id = ${user.id};
      `;
      if (!tenantUser) {
        return handleFailure(
          req,
          {} as ErrorResultSet,
          `Unable to add user ${user.id} to tenant ${tenantId}.`,
        );
      }

      if ("name" in tenantUser) {
        return handleFailure(
          req,
          tenantUser as ErrorResultSet,
          `Unable to add user ${user.id} to tenant ${tenantId}`,
        );
      }

      if ("rowCount" in newUser && newUser.rowCount === 1) {
        return new Response(JSON.stringify(user), { status: 201 });
      } else {
        return handleFailure(
          req,
          {} as ErrorResultSet,
          "Unable to add user to tenant.",
        );
      }
    } else {
      const [tenantUser] = await sql`
        INSERT INTO
          users.tenant_users (tenant_id, user_id, email)
        VALUES
          (
            ${tenantId},
            ${user.id},
            ${user.email}
          )
      `;
      if (!tenantUser) {
        return handleFailure(
          req,
          {} as ErrorResultSet,
          `Unable to add user ${user.id} to tenant ${tenantId}.`,
        );
      }

      if ("name" in tenantUser) {
        return handleFailure(
          req,
          tenantUser as ErrorResultSet,
          `Unable to add user ${user.id} to tenant ${tenantId}`,
        );
      }

      if ("rowCount" in newUser && newUser.rowCount === 1) {
        return responder(JSON.stringify(user), { status: 201 });
      } else {
        return handleFailure(
          req,
          {} as ErrorResultSet,
          "Unable to create user.",
        );
      }
    }
  }

  return responder(null, { status: 401 });
}

/**
 * @swagger
 * /v2/databases/{database}/tenants/{tenantId}/users/{userId}/link:
 *   delete:
 *     tags:
 *     - users
 *     summary: Unlinks a user from a tenant
 *     description: Marks a user to be deleted from the tenant. It does not remove the user from other tenants or invalidate active sessions.
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
  const responder = ResponseLogger(req, EventEnum.UNLINK_USER);
  if (session && session?.user?.id) {
    if (!params.userId) {
      return handleFailure(req, undefined, "userId is required.");
    }
    if (!params.tenantId) {
      return handleFailure(req, undefined, "tenantId is required.");
    }

    const { tenantId, userId } = params;
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
    const [, , users] = await sql`
      ${addContext({ tenantId })};

      ${addContext({ userId })};

      UPDATE users.tenant_users
      SET
        deleted = ${formatTime()}
      WHERE
        user_id = ${userId}
    `;
    if (users && "rowCount" in users && users.rowCount === 1) {
      return responder(null, { status: 204 });
    } else {
      return responder(null, { status: 404 });
    }
  }

  return responder(null, { status: 401 });
}
