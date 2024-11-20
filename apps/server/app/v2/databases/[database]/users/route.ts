import { handleFailure, queryByReq } from "@nile-auth/query";
import { ResponseLogger } from "@nile-auth/logger";
import { NextRequest } from "next/server";
import { ErrorResultSet } from "@nile-auth/query";

/**
 *
 * @swagger
 * /v2/databases/{database}/users:
 *   post:
 *     tags:
 *       - users
 *     summary: Creates a user
 *     description: Adds a brand new user to the database
 *     operationId: createUser
 *     parameters:
 *       - name: database
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: tenantId
 *         description: A tenant id to add the user to when they are created
 *         in: query
 *         schema:
 *           type: string
 *       - name: newTenantName
 *         description: A tenant name to create, then the user to when they are created
 *         in: query
 *         schema:
 *           type: string
 *     requestBody:
 *        content:
 *         application/json:
 *            schema:
 *              $ref: '#/components/schemas/CreateUser'
 *     responses:
 *       "201":
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/User"
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
export async function POST(req: NextRequest) {
  const responder = ResponseLogger(req);
  const body = await req.json();
  const sql = await queryByReq(req);
  if (!body.email) {
    return responder("email is required", { status: 400 });
  }
  const validEmail =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(
      body.email,
    );
  if (!validEmail) {
    return handleFailure(req, undefined, "Invalid email address");
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
      updated;
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

  const sps = new URL(req.url).searchParams;
  let tenantId = sps.get("tenantId");
  const newTenantName = sps.get("newTenantName");

  const user = newUser.rows[0] as { id: string };
  if (newTenantName) {
    const [tenant] = await sql`
      INSERT INTO
        tenants (name)
      VALUES
        (${newTenantName})
      RETURNING
        id;
    `;
    if (tenant && "rowCount" in tenant) {
      tenantId = tenant.rows[0]?.id as string;
    }
  }

  if (tenantId) {
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
    responder(`[${req.method}] ${req.url}`);
    return new Response(
      JSON.stringify({
        ...newUser.rows[0],
        tenants: tenantId ? [tenantId] : [],
      }),
      { status: 201 },
    );
  } else {
    return handleFailure(req, {} as ErrorResultSet, "Unable to create user.");
  }
}
