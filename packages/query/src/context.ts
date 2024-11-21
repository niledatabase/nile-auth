import format from "pg-format";

// pg node prepared statements throw an Internal Error when trying to do `SET`, so "hard code" it into the query
// works in conjunction with queryByReq to look for `:` and replace it accordingly
export function addContext({
  tenantId,
  userId,
}: {
  tenantId?: string;
  userId?: string;
}) {
  let ctx = "";
  if (tenantId) {
    ctx = fixPrepare("SET nile.tenant_id", tenantId);
  }
  // can't have one without the other, but that's not how the query gets built
  if (userId) {
    ctx += fixPrepare("SET nile.user_id", userId);
  }
  return ctx;
}

export function fixPrepare(line: string | null, val: string) {
  if (line) {
    return `:${format(`${line} = '%s'`, val)}`;
  }
  return `${format("'%s'", val)}`;
}
