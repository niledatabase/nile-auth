import { auth } from "@nile-auth/core";
import { formatTime, ErrorResultSet, queryByReq } from "@nile-auth/query";
import { EventEnum, ResponseLogger } from "@nile-auth/logger";

import { NextRequest } from "next/server";
import { handleFailure } from "@nile-auth/query/utils";
import { addContext } from "@nile-auth/query/context";
/**
 * @swagger
 * /v2/databases/{database}/tenants/{tenantId}:
 *   put:
 *     tags:
 *     - tenants
 *     summary: update a tenant
 *     description: updates a tenant in the database
 *     operationId: updateTenant
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
 *       description: Tenant values to be updated.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTenant'
 *           examples:
 *             Rename tenant:
 *               summary: Renames the tenant
 *               description: Tenant Request
 *               value:
 *                 name: New tenant name
 *     responses:
 *       "201":
 *         description: update an existing tenant
 *         content:
 *           application/json:
 *             schema:
 *                $ref: '#/components/schemas/UpdateTenant'
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
  { params }: { params: { database?: string; tenantId?: string } },
) {
  const [session] = await auth(req);
  const responder = ResponseLogger(req, EventEnum.UPDATE_TENANT);
  if (session && session?.user?.id) {
    const { tenantId } = params;
    if (!tenantId) {
      return handleFailure(req, undefined, "tenantId is required.");
    }

    const sql = await queryByReq(req);

    const body = await req.json();
    if (!body.name) {
      return handleFailure(req, undefined, "name is required");
    }

    const [, , userInTenant] = await sql`
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
      userInTenant &&
      "rowCount" in userInTenant &&
      (Number(userInTenant.rows[0]?.count) ?? 0) === 0
    ) {
      return responder(null, { status: 404 });
    }

    const [tenants] = await sql`
      UPDATE tenants
      SET
        name = ${body.name}
      WHERE
        id = ${tenantId}
      RETURNING
        *;
    `;

    if (tenants && "name" in tenants) {
      return handleFailure(req, tenants as ErrorResultSet);
    }

    if (tenants && "rowCount" in tenants && tenants.rowCount > 0) {
      return responder(JSON.stringify(tenants.rows[0]));
    } else {
      return responder(null, { status: 404 });
    }
  }

  return responder(null, { status: 401 });
}

/**
 * @swagger
 * /v2/databases/{database}/tenants/{tenantId}:
 *   delete:
 *     tags:
 *     - tenants
 *     summary: delete a tenant
 *     description: sets a tenant for delete in the database
 *     operationId: deleteTenant
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
 *       "204":
 *         description: update an existing tenant
 *         content: {}
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
export async function DELETE(
  req: NextRequest,
  { params }: { params: { database?: string; tenantId?: string } },
) {
  const responder = ResponseLogger(req, EventEnum.DELETE_TENANT);
  const [session] = await auth(req);
  if (session && session?.user?.id) {
    const { tenantId } = params;
    if (!tenantId) {
      return handleFailure(req, undefined, "tenantId is required.");
    }

    const sql = await queryByReq(req);
    const [, , userInTenant] = await sql`
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
      userInTenant &&
      "rowCount" in userInTenant &&
      (Number(userInTenant.rows[0]?.count) ?? 0) === 0
    ) {
      return responder(null, { status: 404 });
    }

    const [tenants] = await sql`
      UPDATE tenants
      SET
        deleted = ${formatTime()}
      WHERE
        id = ${tenantId}
    `;

    if (tenants && "name" in tenants) {
      return handleFailure(req, tenants as ErrorResultSet);
    }

    if (tenants && "rowCount" in tenants) {
      return responder(null, { status: 204 });
    } else {
      return responder(null, { status: 404 });
    }
  }

  return new Response(null, { status: 401 });
}
/**
 * @swagger
 * /v2/databases/{database}/tenants/{tenantId}:
 *   get:
 *     tags:
 *     - tenants
 *     summary: get a tenant
 *     description: get information about a tenant
 *     operationId: getTenant
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
 *       "200":
 *         description: the tenant
 *         content:
 *           application/json:
 *             schema:
 *                $ref: '#/components/schemas/Tenant'
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
export async function GET(
  req: NextRequest,
  { params }: { params: { database?: string; tenantId?: string } },
) {
  const [session] = await auth(req);
  const responder = ResponseLogger(req, EventEnum.LIST_TENANT);
  if (session && session?.user?.id) {
    const { tenantId } = params;
    if (!params.tenantId) {
      return handleFailure(req, undefined, "tenantId is required.");
    }

    const sql = await queryByReq(req);

    const [, , tenants] = await sql`
      ${addContext({ tenantId })};

      ${addContext({ userId: session.user.id })};

      SELECT
        *
      FROM
        tenants;
    `;

    if (tenants && "name" in tenants) {
      return handleFailure(req, tenants as ErrorResultSet);
    }

    if (tenants && "rowCount" in tenants) {
      return responder(JSON.stringify(tenants.rows[0]));
    } else {
      return responder(null, { status: 404 });
    }
  }

  return responder(null, { status: 401 });
}
