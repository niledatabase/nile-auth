import { auth } from "@nile-auth/core";
import { EventEnum, ResponseLogger } from "@nile-auth/logger";
import { queryByReq, ErrorResultSet } from "@nile-auth/query";
import { addContext } from "@nile-auth/query/context";
import { handleFailure } from "@nile-auth/query/utils";
import { NextRequest } from "next/server";

/**
 * @swagger
 * /v2/databases/{database}/tenants/{tenantId}/invites:
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
): Promise<Response> {
  const [responder, reporter] = ResponseLogger(req, EventEnum.LIST_INVITES);
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
        return responder(JSON.stringify(tenants.rows));
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
