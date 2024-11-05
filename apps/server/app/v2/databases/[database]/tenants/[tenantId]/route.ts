import { auth } from "@nile-auth/core";
import {
  formatTime,
  ErrorResultSet,
  handleFailure,
  queryByReq,
} from "@nile-auth/query";
import { ResponseLogger } from "@nile-auth/logger";

import { NextRequest } from "next/server";

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
 *     responses:
 *       "201":
 *         description: update an existing tenant
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
export async function PUT(
  req: NextRequest,
  { params }: { params: { database?: string; tenantId?: string } },
) {
  const [session] = await auth(req);
  const responder = ResponseLogger(req);
  if (session && session?.user?.id) {
    if (!params.tenantId) {
      return handleFailure(req, undefined, "tenantId is required.");
    }

    const sql = await queryByReq(req);

    const userInTenant = await sql`
      SELECT
        COUNT()
      FROM
        users.tenant_users
      WHERE
        user_id = ${session.user.id}
        AND tenant_id = ${params.tenantId}
    `;

    if (userInTenant && "name" in userInTenant) {
      return handleFailure(req, userInTenant as ErrorResultSet);
    }
    if (!userInTenant || (userInTenant && userInTenant.rowCount === 0)) {
      return responder(null, { status: 404 });
    }
    const body = await req.json();
    const tenants = await sql`
      UPDATE tenants
      SET
        name = ${body.name}
      WHERE
        id = ${params.tenantId}
      RETURNING
        *;
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
  const responder = ResponseLogger(req);
  const [session] = await auth(req);
  if (session && session?.user?.id) {
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

    if (userInTenant && "name" in userInTenant) {
      return handleFailure(req, userInTenant as ErrorResultSet);
    }
    if (!userInTenant || (userInTenant && userInTenant.rowCount === 0)) {
      return new Response(null, { status: 404 });
    }
    const tenants = await sql`
      UPDATE tenants
      SET
        deleted = ${formatTime()}
      WHERE
        id = ${params.tenantId}
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
  const responder = ResponseLogger(req);
  if (session && session?.user?.id) {
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

    if (userInTenant && "name" in userInTenant) {
      return handleFailure(req, userInTenant as ErrorResultSet);
    }
    if (!userInTenant || (userInTenant && userInTenant.rowCount === 0)) {
      return new Response(null, { status: 404 });
    }
    const tenants = await sql`
      SELECT
        *
      FROM
        tenants
      WHERE
        id = ${params.tenantId}
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
