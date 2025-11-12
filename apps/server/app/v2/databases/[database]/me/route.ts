import { auth } from "@nile-auth/core";
import {
  queryByReq,
  ErrorResultSet,
  raw,
  multiFactorColumn,
} from "@nile-auth/query";
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
  const [responder, reporter] = ResponseLogger(req, EventEnum.ME);
  try {
    const [session] = await auth(req);
    if (session && session?.user?.id) {
      const sql = await queryByReq(req);
      const multiFactorSelect = await multiFactorColumn(sql, {
        alias: "multiFactor",
      });
      const [[user], [tenants]] = await Promise.all([
        sql`
          SELECT
            id,
            email,
            name,
            family_name AS "familyName",
            given_name AS "givenName",
            picture,
            created,
            updated,
            email_verified AS "emailVerified",
            ${multiFactorSelect}
          FROM
            users.users
          WHERE
            id = ${session.user.id}
            AND deleted IS NULL
        `,
        sql`
          SELECT DISTINCT
            t.id
          FROM
            public.tenants t
            JOIN users.tenant_users tu ON t.id = tu.tenant_id
          WHERE
            tu.user_id = ${session.user.id}
            AND tu.deleted IS NULL
            AND t.deleted IS NULL
        `,
      ]);

      if (tenants && "name" in tenants) {
        return handleFailure(responder, tenants as ErrorResultSet);
      }

      if (user && "name" in user) {
        return handleFailure(responder, user as ErrorResultSet);
      }

      if (user && "rowCount" in user && user.rowCount === 1) {
        return responder(
          JSON.stringify({
            ...user.rows[0],
            tenants: tenants?.rows?.map(({ id }) => id) ?? [],
          }),
        );
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

/**
 * @swagger
 * /v2/databases/{database}/me:
 *   put:
 *     tags:
 *     - users
 *     summary: Update the principal profile
 *     description: Update the principal associated with the provided session
 *     operationId: updateMe
 *     parameters:
 *       - name: database
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jane Doe
 *               familyName:
 *                 type: string
 *                 example: Doe
 *               givenName:
 *                 type: string
 *                 example: Jane
 *               picture:
 *                 type: string
 *                 format: uri
 *                 example: https://example.com/avatar.jpg
 *               emailVerified:
 *                 type: boolean
 *                 description: Whether the user's email is verified
 *             required:
 *               - name
 *               - familyName
 *               - givenName
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
  const [responder, reporter] = ResponseLogger(req, EventEnum.ME_UPDATE);
  try {
    const [session] = await auth(req);
    if (session && session?.user?.id) {
      const sql = await queryByReq(req);
      const multiFactorSelect = await multiFactorColumn(sql, {
        alias: "multiFactor",
      });
      const [[userRows], [tenants]] = await Promise.all([
        sql`
          SELECT
            id,
            email,
            name,
            family_name AS "familyName",
            given_name AS "givenName",
            picture,
            created,
            updated,
            email_verified AS "emailVerified",
            ${multiFactorSelect}
          FROM
            users.users
          WHERE
            id = ${session.user.id}
            AND deleted IS NULL
        `,
        sql`
          SELECT DISTINCT
            t.id
          FROM
            public.tenants t
            JOIN users.tenant_users tu ON t.id = tu.tenant_id
          WHERE
            tu.user_id = ${session.user.id}
            AND tu.deleted IS NULL
            AND t.deleted IS NULL
        `,
      ]);

      if (tenants && "name" in tenants) {
        return handleFailure(responder, tenants as ErrorResultSet);
      }

      if (userRows && "name" in userRows) {
        return handleFailure(responder, userRows as ErrorResultSet);
      }
      const body = await req.json();
      const user = userRows?.rows[0] as {
        name: string;
        familyName: string;
        givenName: string;
        picture: string;
        emailVerified: string;
      };
      const [updatedUser] = await sql`
        UPDATE users.users
        SET
          name = ${body?.name ?? user.name},
          family_name = ${body?.familyName ?? user.familyName},
          given_name = ${body.givenName ?? user.givenName},
          picture = ${body.picture ?? user.picture},
          email_verified = ${body.emailVerified
          ? raw("CURRENT_TIMESTAMP")
          : user.emailVerified}
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
          email_verified AS "emailVerified",
          ${multiFactorSelect}
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
  } catch (e) {
    reporter.error(e);
    return responder(e instanceof Error ? e.message : "Internal server error", {
      status: 500,
    });
  }
}

/**
 * @swagger
 * /v2/databases/{database}/me:
 *   delete:
 *     tags:
 *     - tenants
 *     summary: delete the current user
 *     description: sets the current user for delete.
 *     operationId: deleteMe
 *     parameters:
 *       - name: database
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "204":
 *         description: user has been deleted
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
export async function DELETE(req: NextRequest) {
  const [responder, reporter] = ResponseLogger(req, EventEnum.ME_DELETE);
  try {
    const [session] = await auth(req);
    if (session && session?.user?.id) {
      const sql = await queryByReq(req);
      await sql`
        UPDATE users.users
        SET
          deleted = CURRENT_TIMESTAMP
        WHERE
          id = ${session.user.id}
      `;
      return responder(null, { status: 204 });
    }
    return responder(null, { status: 401 });
  } catch (e) {
    reporter.error(e);
    return responder(e instanceof Error ? e.message : "Internal server error", {
      status: 500,
    });
  }
}
