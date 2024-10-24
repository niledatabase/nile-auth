import { auth } from "@nile-auth/core";
import { ErrorResultSet, handleFailure, queryByReq } from "@nile-auth/query";
import { ResponseLogger } from "@nile-auth/logger";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const [session] = await auth(req);
  const responder = ResponseLogger(req);
  if (session && session?.user?.id) {
    const sql = await queryByReq(req);
    const tenantRows = await sql`
      SELECT DISTINCT
        t.id,
        t.name
      FROM
        tenants t
        JOIN tenant_users tu ON t.id = tu.tenant_id
      WHERE
        tu.user_id = ${session.user.id}
        AND tu.deleted IS NULL
        AND t.deleted IS NULL
    `;
    if (tenantRows && "name" in tenantRows) {
      return handleFailure(req, tenantRows as ErrorResultSet);
    }
    if (tenantRows && "rowCount" in tenantRows) {
      return responder(JSON.stringify(tenantRows.rows));
    } else {
      return responder(null, { status: 404 });
    }
  }
  return responder(null, { status: 401 });
}
