import { auth } from "@nile-auth/core";
import { EventEnum, ResponseLogger } from "@nile-auth/logger";
import { ErrorResultSet, queryByReq } from "@nile-auth/query";
import { addContext } from "@nile-auth/query/context";
import { handleFailure } from "@nile-auth/query/utils";
import { NextRequest } from "next/server";

/**
 * /v2/databases/{database}/tenants/{tenantId}/invite/{inviteId}:
 *   delete:
 *     summary: Delete an invite for a tenant user
 *     description: Deletes a specific invite from the `auth.invites` table for a given tenant and invite ID. Only authenticated users are allowed.
 *     operationId: deleteInvite
 *     tags:
 *       - tenants
 *     parameters:
 *       - name: tenantId
 *         in: path
 *         required: true
 *         description: The ID of the tenant whose invite should be deleted.
 *         schema:
 *           type: string
 *       - name: inviteId
 *         in: path
 *         required: true
 *         description: The ID of the invite to delete.
 *         schema:
 *           type: string
 *       - name: database
 *         in: path
 *         required: true
 *         description: The target database (used internally).
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Successfully deleted the invite.
 *       401:
 *         description: Unauthorized – user is not authenticated.
 *       403:
 *         description: Forbidden – user does not have permission.
 *       404:
 *         description: Invite not found.
 *       422:
 *         description: Missing or invalid parameters.
 *       500:
 *         description: Internal server error.
 *     security:
 *       - sessionAuth: []
 */

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: { database: string; tenantId: string; inviteId: string } },
) {
  const [responder, reporter] = ResponseLogger(req, EventEnum.DELETE_INVITE);
  try {
    const [session] = await auth(req);
    if (session && session?.user?.id) {
      const { inviteId, tenantId } = params;
      if (!tenantId) {
        return handleFailure(
          responder,
          { status: 422 },
          "tenantId is required.",
        );
      }
      if (!inviteId) {
        return handleFailure(
          responder,
          { status: 422 },
          "inviteId is required.",
        );
      }
      const sql = await queryByReq(req);
      const [contextError, , deleted] = await sql`
        ${addContext({ tenantId })};

        ${addContext({ userId: session.user.id })};

        DELETE FROM auth.invites
        WHERE
          id = ${inviteId};
      `;
      if (contextError && "name" in contextError) {
        return handleFailure(responder, contextError as ErrorResultSet);
      }

      if (deleted && "rowCount" in deleted) {
        return responder(null, { status: 204 });
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
