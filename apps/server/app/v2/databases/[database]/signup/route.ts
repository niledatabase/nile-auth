/**
 * @swagger
 * /v2/databases/{database}/signup:
 *   post:
 *     tags:
 *     - users
 *     summary: Signs up a new user
 *     description: Creates a user in the database and then logs them in.
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
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUser'
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

import { ResponseLogger } from "@nile-auth/logger";
import { NextRequest } from "next/server";

import { POST as USER_POST } from "../users/route";

import { login } from "./login";
import { validCsrfToken } from "@nile-auth/core/csrf";

export async function POST(
  req: NextRequest,
  { params }: { params: { database: string; nextauth: string[] } },
) {
  const responder = ResponseLogger(req);
  const [hasValidToken] = await validCsrfToken(
    req,
    process.env.NEXTAUTH_SECRET,
  );
  const cloned = req.clone() as NextRequest;

  if (!hasValidToken) {
    // maybe make the client go get it
    return new Response("Request blocked", { status: 400 });
  }
  // support /swagger ability to allow developers to log in
  const swagger = req.clone();

  const swagBody = await swagger.json();

  // only do this if sign up has swagger values
  if (swagBody.developerPassword) {
    process.env.NILEDB_USER = swagBody.developerUser;
    process.env.NILEDB_PASSWORD = swagBody.developerPassword;
    process.env.NILEDB_NAME = swagBody.database;
    process.env.NILEDB_HOST = swagBody.host;
    process.env.NILEDB_PORT = swagBody.port;
  }

  const userCreate = await USER_POST(req);
  if (userCreate.status > 201) {
    return responder(await userCreate.text(), { status: userCreate.status });
  }

  const headers = await login(cloned, { params });
  return responder(await userCreate.text(), { headers });
}
