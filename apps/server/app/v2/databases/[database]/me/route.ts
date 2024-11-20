import { auth } from "@nile-auth/core";
import { handleFailure, queryByReq, ErrorResultSet } from "@nile-auth/query";
import { ResponseLogger } from "@nile-auth/logger";
import { NextRequest } from "next/server";

/**
 * @swagger
 * /v2/databases/{database}/me:
 *   get:
 *     tags:
 *     - users
 *     summary: Identify the principal
 *     description: Returns information about the principal associated with the session
 *       provided
 *     operationId: me
 *     parameters:
 *       - name: database
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: Identified user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
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
export async function GET(req: NextRequest) {
  const responder = ResponseLogger(req);
  const [session] = await auth(req);
  if (session && session?.user?.id) {
    const sql = await queryByReq(req);
    const [[user], [tenants]] = await Promise.all([
      await sql`
        SELECT
          id,
          email,
          name,
          family_name AS "familyName",
          given_name AS "givenName",
          picture,
          created,
          updated
        FROM
          users.users
        WHERE
          id = ${session.user.id}
          AND deleted IS NULL
      `,
      await sql`
        SELECT DISTINCT
          t.id
        FROM
          tenants t
          JOIN tenant_users tu ON t.id = tu.tenant_id
        WHERE
          tu.user_id = ${session.user.id}
          AND tu.deleted IS NULL
          AND t.deleted IS NULL
      `,
    ]);

    if (tenants && "name" in tenants) {
      return handleFailure(req, tenants as ErrorResultSet);
    }

    if (user && "name" in user) {
      return handleFailure(req, user as ErrorResultSet);
    }

    if (user && "rowCount" in user && user.rowCount === 1) {
      return responder(
        JSON.stringify({ ...user.rows[0], tenants: tenants?.rows ?? [] }),
      );
    } else {
      return responder(null, { status: 404 });
    }
  }
  return responder(null, { status: 401 });
}
