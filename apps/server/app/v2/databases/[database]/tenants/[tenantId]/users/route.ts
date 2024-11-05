import { auth } from "@nile-auth/core";
import { handleFailure, queryByReq } from "@nile-auth/query";
import { ResponseLogger } from "@nile-auth/logger";
import { NextRequest } from "next/server";

import { ErrorResultSet } from "@nile-auth/query";

/**
 * @swagger
 * /v2/databases/{database}/tenants/{tenantId}/users:
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
 *                $ref: '#/components/schemas/User'
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
    let users;
    const userInTenant = await sql`
      SELECT
        COUNT(*)
      FROM
        users.tenant_users
      WHERE
        user_id = ${session.user.id}
        AND tenant_id = ${params.tenantId}
        AND deleted IS NULL
    `;
    if (
      userInTenant &&
      "rowCount" in userInTenant &&
      userInTenant.rowCount > 0
    ) {
      users = await sql`
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
          tu.tenant_id = ${params.tenantId}
          AND u.deleted IS NULL
          AND tu.deleted IS NULL
      `;
    } else {
      return responder(null, { status: 404 });
    }

    if (users && "name" in users) {
      return handleFailure(req, users as ErrorResultSet);
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
 * /v2/databases/{database}/tenants/{tenantId}/users:
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
 *              $ref: '#/components/schemas/UpdateUser'
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
export async function POST(
  req: NextRequest,
  { params }: { params: { database?: string; tenantId?: string } },
) {
  const [session] = await auth(req);
  const responder = ResponseLogger(req);
  if (session && session?.user?.id) {
    const { tenantId } = params ?? {};
    if (!tenantId) {
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
        AND tenant_id = ${tenantId}
    `;
    if (
      userInTenant &&
      "rowCount" in userInTenant &&
      userInTenant.rowCount === 0
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

    const newUser = await sql`
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
    const tenantUser = await sql`
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
      const credentials = await sql`
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

/**
 *
 * @swagger
 * /v2/databases/{database}/tenants/{tenantId}/users:
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
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUser'
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
  { params }: { params: { database?: string; tenantId?: string } },
) {
  const [session] = await auth(req);
  const responder = ResponseLogger(req);
  if (session && session?.user?.id) {
    const { tenantId } = params ?? {};
    if (!tenantId) {
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
        AND tenant_id = ${tenantId}
    `;
    if (
      userInTenant &&
      "rowCount" in userInTenant &&
      userInTenant.rowCount === 0
    ) {
      return responder(null, { status: 404 });
    }

    const body = await req.json();
    if (!body.email) {
      return new Response("Email is required.", { status: 400 });
    }

    const newUser = await sql`
      SELECT
        *
      FROM
        users.users
      WHERE
        email = ${body.email}
    `;
    if (!newUser) {
      return responder(null, { status: 404 });
    }
    if ("name" in newUser) {
      return handleFailure(req, newUser as ErrorResultSet);
    }
    const user = newUser.rows[0] as { id: string };
    const exists = await sql`
      SELECT
        *
      FROM
        users.tenant_users
      WHERE
        user_id = ${user.id}
        AND tenant_id = ${tenantId}
    `;
    if (exists && "rowCount" in exists && exists.rowCount > 0) {
      const tenantUser = await sql`
        UPDATE users.tenant_users
        SET
          deleted = NULL
        WHERE
          user_id = ${user.id}
          AND tenant_id = ${tenantId}
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
      const tenantUser = await sql`
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
