import { auth } from "@nile-auth/core";
import { queryByReq, ErrorResultSet } from "@nile-auth/query";
import { EventEnum, ResponseLogger } from "@nile-auth/logger";
import { NextRequest } from "next/server";
import { handleFailure } from "@nile-auth/query/utils";

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
  const responder = ResponseLogger(req, EventEnum.ME);
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
          updated,
          email_verified AS "emailVerified"
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

/**
 * @swagger
 * /v2/databases/{database}/me:
 *   put:
 *     tags:
 *     - users
 *     summary: update the principal profile
 *     description: Update the principal in the associated with the session
 *       provided
 *     operationId: updateMe
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
export async function PUT(req: NextRequest) {
  const responder = ResponseLogger(req, EventEnum.ME);
  const [session] = await auth(req);
  if (session && session?.user?.id) {
    const sql = await queryByReq(req);
    const [[userRows], [tenants]] = await Promise.all([
      await sql`
        SELECT
          id,
          email,
          name,
          family_name AS "familyName",
          given_name AS "givenName",
          picture,
          created,
          updated,
          email_verified AS "emailVerified"
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

    if (userRows && "name" in userRows) {
      return handleFailure(req, userRows as ErrorResultSet);
    }
    const body = await req.json();
    const user = userRows?.rows[0] as {
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
        id = ${session?.user?.id}
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

    if (
      updatedUser &&
      "rowCount" in updatedUser &&
      updatedUser.rowCount === 1
    ) {
      return responder(
        JSON.stringify({
          ...updatedUser.rows[0],
          tenants: tenants?.rows ?? [],
        }),
      );
    } else {
      return responder(null, { status: 404 });
    }
  }
  return responder(null, { status: 401 });
}
