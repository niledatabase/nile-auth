/**
 * @swagger
 * /v2/databases/{database}/signup:
 *   post:
 *     tags:
 *     - databases
 *     summary: Creates a user
 *     description: Creates a user in the database
 *     operationId: signup
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
 *     responses:
 *       "201":
 *         description: User created
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
 *       "401":
 *         description: Unauthorized
 *         content: {}
 */

import { ErrorResultSet, handleFailure, queryByReq } from "@nile-auth/query";
import { ResponseLogger } from "@nile-auth/logger";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const responder = ResponseLogger(req);
  const body = await req.json();
  const sql = await queryByReq(req);
  const newUser = await sql`
    INSERT INTO
      users.users (email, name, family_name, given_name, picture)
    VALUES
      (
        ${body.email},
        ${body.name},
        ${body.familyName},
        ${body.givenName},
        ${body.picture},
        ${body.emailVerified}
      )
    RETURNING
      id,
      email,
      name,
      family_name AS "familyName",
      given_name AS "givenName",
      picture,
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
  const [user] = newUser.rows;
  if (body.password) {
    const credentials = await sql`
      INSERT INTO
        auth.credentials (user_id, method, provider, payload)
      VALUES
        (
          ${String(user?.id)},
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
    if ("rowCount" in newUser && newUser.rowCount === 1) {
      return responder(
        JSON.stringify({
          ...newUser.rows[0],
          tenants: [],
        }),
        { status: 201 },
      );
    } else {
      return handleFailure(req, {} as ErrorResultSet, "Unable to create user.");
    }
  }
}
