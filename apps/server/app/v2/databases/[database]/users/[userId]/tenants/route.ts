import { auth } from "@nile-auth/core";
import { ErrorResultSet, queryByReq } from "@nile-auth/query";
import { ResponseLogger, EventEnum } from "@nile-auth/logger";
import { NextRequest } from "next/server";
import { handleFailure } from "@nile-auth/query/utils";
import { setTenantCookie } from "@nile-auth/core/cookies";

/**
 *
 * @swagger
 * /v2/databases/{database}/users/{userId}/tenants:
 *   get:
 *     tags:
 *       - users
 *     summary: lists tenants of user
 *     description: lists the tenants associated with a user
 *     operationId: listUserTenants
 *     parameters:
 *       - name: database
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: userId
 *         description: The id of of the user
 *         required: true
 *         in: path
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Tenant"
 *       "400":
 *         description: API/Database failures
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       "401":
 *         description: Unauthorized
 *         content: {}
 */

export async function GET(req: NextRequest) {
  const [responder, reporter] = ResponseLogger(req, EventEnum.LIST_TENANTS);
  try {
    const [session] = await auth(req);
    if (session && session?.user?.id) {
      const sql = await queryByReq(req);
      const [tenantRows] = await sql`
        SELECT DISTINCT
          t.id,
          t.name
        FROM
          public.tenants t
          JOIN users.tenant_users tu ON t.id = tu.tenant_id
        WHERE
          tu.user_id = ${session.user.id}
          AND tu.deleted IS NULL
          AND t.deleted IS NULL
      `;
      if (tenantRows && "name" in tenantRows) {
        return handleFailure(responder, tenantRows as ErrorResultSet);
      }

      if (tenantRows && "rowCount" in tenantRows) {
        const headers = setTenantCookie(req, tenantRows.rows);

        return responder(JSON.stringify(tenantRows.rows), { headers });
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
