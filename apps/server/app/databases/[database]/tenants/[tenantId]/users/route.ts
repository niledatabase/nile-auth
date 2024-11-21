import { auth } from "@nile-auth/core";
import { queryByReq } from "@nile-auth/query";
import { handleFailure } from "@nile-auth/query/utils";
import { EventEnum, ResponseLogger } from "@nile-auth/logger";
import { NextRequest } from "next/server";

import { ErrorResultSet } from "@nile-auth/query";
import { addContext } from "@nile-auth/query/context";

/**
 * @swagger
 * /databases/{database}/tenants/{tenantId}/users:
 *   get:
 *     tags:
 *     - users
 *     summary: a list of tenant users
 *     description: Returns a list of tenant users from the database
 *     operationId: listTenantUsers
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
 *                $ref: '#/components/schemas/TenantUser'
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
  const responder = ResponseLogger(req, EventEnum.LIST_TENANT_USERS);
  if (session && session?.user?.id) {
    const { tenantId } = params;
    if (!tenantId) {
      return handleFailure(req, undefined, "tenantId is required.");
    }
    const sql = await queryByReq(req);

    const [, users] = await sql`
      ${addContext({ tenantId })};

      SELECT
        id,
        u.email,
        name,
        family_name AS "familyName",
        given_name AS "givenName",
        picture
      FROM
        users.users u
        JOIN users.tenant_users tu ON u.id = tu.user_id
      WHERE
        u.deleted IS NULL
        AND tu.deleted IS NULL
    `;

    if (users && "name" in users) {
      const fail = handleFailure(req, users as ErrorResultSet);
      return fail;
    }

    if (users && "rowCount" in users) {
      return responder(JSON.stringify(users.rows));
    } else {
      return responder(null, { status: 404 });
    }
  }

  return responder(null, { status: 401 });
}

/**
 *
 * @swagger
 * /databases/{database}/tenants/{tenantId}/users:
 *   post:
 *     tags:
 *       - users
 *     summary: create a new user and assigns them to a tenant
 *     description: Creates a brand new user on a tenant
 *     operationId: createTenantUser
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
 *        content:
 *         application/json:
 *            schema:
 *              $ref: '#/components/schemas/CreateUser'
 *     responses:
 *       "201":
 *         description: update an existing tenant wih a new user
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
export async function POST(
  req: NextRequest,
  { params }: { params: { database?: string; tenantId?: string } },
) {
  const [session] = await auth(req);
  const responder = ResponseLogger(req, EventEnum.CREATE_TENANT_USER);
  if (session && session?.user?.id) {
    const { tenantId } = params ?? {};
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
    let body;
    try {
      body = await req.json();
    } catch (e) {
      /*noop*/
    }
    if (!body) {
      return handleFailure(
        req,
        {} as ErrorResultSet,
        "Missing body from request",
      );
    }
    if (!body.email || !body.password) {
      return handleFailure(
        req,
        {} as ErrorResultSet,
        "Email and password are required.",
      );
    }

    const [newUser] = await sql`
      INSERT INTO
        users.users (email, name, family_name, given_name, picture)
      VALUES
        (
          ${body.email},
          ${body.name},
          ${body.familyName},
          ${body.givenName},
          ${body.picture}
        )
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
    if (!newUser) {
      return responder(null, { status: 404 });
    }
    if ("name" in newUser) {
      return handleFailure(
        req,
        newUser as ErrorResultSet,
        `User with email ${body.email}`,
      );
    }
    const user = newUser.rows[0] as { id: string; email: string };
    const [tenantUser] = await sql`
      INSERT INTO
        users.tenant_users (tenant_id, user_id, email)
      VALUES
        (
          ${tenantId},
          ${user.id},
          ${body.email}
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

    if (body.password) {
      const [credentials] = await sql`
        INSERT INTO
          auth.credentials (user_id, method, provider, payload)
        VALUES
          (
            ${user.id},
            'EMAIL_PASSWORD',
            'nile',
            jsonb_build_object(
              'crypt',
              'crypt-bf/8',
              'hash',
              public.crypt (
                ${body.password},
                public.gen_salt ('bf', 8)
              ),
              'email',
              ${body.email}::text
            )
          )
      `;
      if (credentials && "name" in credentials) {
        return handleFailure(
          req,
          credentials as ErrorResultSet,
          `Unable to save credentials.`,
        );
      }
    }
    if ("rowCount" in newUser && newUser.rowCount === 1) {
      return responder(JSON.stringify(user), { status: 201 });
    } else {
      return handleFailure(req, {} as ErrorResultSet, "Unable to create user.");
    }
  }

  return responder(null, { status: 401 });
}
