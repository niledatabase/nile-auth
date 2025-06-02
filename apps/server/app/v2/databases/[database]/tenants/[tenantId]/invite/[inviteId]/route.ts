import { auth } from "@nile-auth/core";
import { EventEnum, ResponseLogger } from "@nile-auth/logger";
import { ErrorResultSet, queryByReq } from "@nile-auth/query";
import { addContext } from "@nile-auth/query/context";
import { handleFailure } from "@nile-auth/query/utils";
import { NextRequest } from "next/server";

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: { database: string; tenantId: string; inviteId: string } },
) {
  const [responder, reporter] = ResponseLogger(
    req,
    EventEnum.INVITE_TENANT_USER_DELETE,
  );
  try {
    const [session] = await auth(req);
    if (session && session?.user?.id) {
      const { inviteId, tenantId } = params;
      if (!tenantId) {
        return handleFailure(responder, undefined, "tenantId is required.");
      }
      if (!inviteId) {
        return handleFailure(responder, undefined, "inviteId is required.");
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
