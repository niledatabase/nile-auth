import { auth } from "@nile-auth/core";
import { queryByReq } from "@nile-auth/query";
import { EventEnum, ResponseLogger } from "@nile-auth/logger";
import { NextRequest } from "next/server";

import { ErrorResultSet } from "@nile-auth/query";
import { handleFailure } from "@nile-auth/query/utils";
import { setTenantCookie } from "@nile-auth/core/cookies";
/**
 * @swagger
 * /v2/databases/{database}/tenants:
 *   post:
 *     tags:
 *     - tenants
 *     summary: creates a tenant
 *     description: makes a tenant, assigns user to that tenant
 *     operationId: createTenant
 *     parameters:
 *       - name: database
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       description: A wrapper for the tenant name.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTenantRequest'
 *           examples:
 *             Create Tenant Request:
 *               summary: Creates a named tenant
 *               description: Create Tenant Request
 *               value:
 *                 name: My Sandbox
 *     responses:
 *       "201":
 *         description: A created tenants
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
export async function POST(req: NextRequest) {
  const [responder, reporter] = ResponseLogger(req, EventEnum.CREATE_TENANT);
  try {
    const [session] = await auth(req);
    if (session && session?.user?.id) {
      const body = await req.json();
      if (!body.name) {
        return handleFailure(
          responder,
          {} as ErrorResultSet,
          "name is required",
        );
      }
      const sql = await queryByReq(req);
      const [userRows] = await sql`
        SELECT
          *
        FROM
          users.users
        WHERE
          id = ${session.user.id}
          AND deleted IS NULL
      `;
      if (!userRows || (userRows && "name" in userRows)) {
        return handleFailure(responder, userRows as ErrorResultSet);
      }
      const [user] = userRows.rows;

      const [tenants] = body.id
        ? await sql`
            INSERT INTO
              public.tenants (name, id)
            VALUES
              (
                ${body.name},
                ${body.id}
              )
            RETURNING
              *
          `
        : await sql`
            INSERT INTO
              public.tenants (name)
            VALUES
              (${body.name})
            RETURNING
              *
          `;

      if (!tenants || (tenants && "name" in tenants)) {
        return handleFailure(
          responder,
          tenants as ErrorResultSet,
          `tenant with id ${body.id}`,
        );
      }

      const { id: tenantId } = tenants.rows[0] ?? {};

      if (
        tenants &&
        "rowCount" in tenants &&
        tenantId &&
        user &&
        "id" in user &&
        "email" in user
      ) {
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
            responder,
            {} as ErrorResultSet,
            `Unable to add user ${user.id} to tenant ${tenantId}.`,
          );
        }
        const headers = setTenantCookie(req, tenants.rows);
        return responder(JSON.stringify(tenants.rows[0]), { headers });
      } else {
        return responder(null, { status: 404 });
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
