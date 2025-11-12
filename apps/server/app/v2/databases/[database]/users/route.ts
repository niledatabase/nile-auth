import {
  ErrorResultSet,
  getRow,
  multiFactorColumn,
  queryByReq,
} from "@nile-auth/query";
import { EventEnum, ResponseLogger } from "@nile-auth/logger";
import { NextRequest } from "next/server";
import { handleFailure } from "@nile-auth/query/utils";
import { ProviderMethods } from "@nile-auth/core";

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
  const [responder, reporter] = ResponseLogger(req, EventEnum.CREATE_USER);
  try {
    const preserve = await req.clone();
    const body = await req.json();
    const sql = await queryByReq(preserve);
    if (!body.email) {
      return responder("email is required", { status: 400 });
    }
    const validEmail =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(
        body.email,
      );
    if (!validEmail) {
      return handleFailure(responder, undefined, "Invalid email address");
    }
    const [oldUser] = await sql`
      SELECT
        *
      FROM
        users.users
      WHERE
        email = ${body.email}
    `;

    const existingUser = getRow<{
      email_verified: boolean;
      id: string;
      email: string;
    }>(oldUser);

    if (existingUser) {
      // if this user exists,their email must be verified.
      const [hasSso] = await sql`
        SELECT
          EXISTS (
            SELECT
              1
            FROM
              auth.credentials
            WHERE
              user_id = ${existingUser.id}
              AND method NOT IN ('EMAIL_PASSWORD', 'MFA')
          ) AS has_other_methods;
      `;
      const { has_other_methods } = getRow(hasSso) ?? {};
      if (has_other_methods) {
        // user has an SSO, so the email *must* be verified. If it's not, send an email.
        if (!existingUser?.email_verified) {
          return responder("Existing users must verify their email address.", {
            status: 400,
          });
        }
      }
      return responder(`The user ${body.email} already exists`, {
        status: 400,
      });
    }

    const multiFactorSelect = await multiFactorColumn(sql, {
      alias: "multiFactor",
    });
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
        email_verified AS "emailVerified",
        ${multiFactorSelect},
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
      // the user insert failed. It is possible the user already used the email address for SSO.
      // we can allow the creation of a password credential.
      // if you can just guess someone's email, you would be able to set their password to anything you like
      //  if you have a verified email, reject because its been done
      // after email verification, create the credential there
      // if email cred exists, delete on SSO  and make them verify
      return handleFailure(
        responder,
        newUser as ErrorResultSet,
        `User with email ${body.email}`,
      );
    }

    const [user] = newUser.rows ?? [];

    if (!user || !user?.id) {
      return responder(null, { status: 404 });
    }

    if (body.password) {
      const [credentials] = await sql`
        INSERT INTO
          auth.credentials (user_id, method, provider, payload)
        VALUES
          (
            ${user.id},
            ${ProviderMethods.EMAIL_PASSWORD},
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
          responder,
          credentials as ErrorResultSet,
          `Unable to save credentials.`,
        );
      }
    }

    const sps = new URL(req.url).searchParams;
    let tenantId = sps.get("tenantId");
    const newTenantName = sps.get("newTenantName");

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
          responder,
          {} as ErrorResultSet,
          `Unable to add user ${user.id} to tenant ${tenantId}.`,
        );
      }

      if ("name" in tenantUser) {
        return handleFailure(
          responder,
          tenantUser as ErrorResultSet,
          `Unable to add user ${user.id} to tenant ${tenantId}`,
        );
      }
    }

    if ("rowCount" in newUser && newUser.rowCount === 1) {
      return responder(
        JSON.stringify({
          ...newUser.rows[0],
          tenants: tenantId ? [tenantId] : [],
        }),
        { status: 201 },
      );
    } else {
      return handleFailure(
        responder,
        {} as ErrorResultSet,
        "Unable to create user.",
      );
    }
  } catch (e) {
    reporter.error(e);
    return responder(e instanceof Error ? e.message : "Internal server error", {
      status: 500,
    });
  }
}
