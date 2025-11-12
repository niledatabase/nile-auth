import { raw, RawSQL, SqlExecutor } from "./sqlTypes";

type MultiFactorCacheEntry = {
  exists: boolean;
  checkedAt: number;
};

const MULTI_FACTOR_CACHE_TTL_MS = 60 * 1000;
const MULTI_FACTOR_COLUMN = "multi_factor";
const MULTI_FACTOR_FALLBACK = "NULL::text";
const multiFactorCache = new WeakMap<SqlExecutor, MultiFactorCacheEntry>();

export async function hasMultiFactorColumn(
  sql: SqlExecutor,
): Promise<boolean> {
  const cached = multiFactorCache.get(sql);
  if (
    cached &&
    (cached.exists ||
      Date.now() - cached.checkedAt < MULTI_FACTOR_CACHE_TTL_MS)
  ) {
    return cached.exists;
  }

  const exists = await checkMultiFactorColumn(sql);
  multiFactorCache.set(sql, { exists, checkedAt: Date.now() });
  return exists;
}

export async function multiFactorColumn(
  sql: SqlExecutor,
  options?: { alias?: string },
): Promise<RawSQL> {
  const exists = await hasMultiFactorColumn(sql);
  const alias = sanitizeAlias(options?.alias);
  const columnExpr = exists ? MULTI_FACTOR_COLUMN : MULTI_FACTOR_FALLBACK;
  return raw(`${columnExpr} AS ${alias}`);
}

async function checkMultiFactorColumn(sql: SqlExecutor): Promise<boolean> {
  const result = await sql`
    SELECT
      1
    FROM
      information_schema.columns
    WHERE
      table_schema = 'users'
      AND table_name = 'users'
      AND column_name = 'multi_factor'
    LIMIT
      1
  `;

  const normalized = normalizeResult(result);
  return hasRows(normalized);
}

function normalizeResult(result: unknown) {
  if (Array.isArray(result)) {
    for (const entry of result) {
      if (entry !== undefined) {
        return entry;
      }
    }
    return undefined;
  }

  return result;
}

function hasRows(result: unknown): boolean {
  if (!result || typeof result !== "object") {
    return false;
  }

  if ("rows" in result && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return Boolean((result as { rows: unknown[] }).rows.length);
  }

  if (
    "rowCount" in result &&
    typeof (result as { rowCount?: number }).rowCount === "number"
  ) {
    return Number((result as { rowCount: number }).rowCount) > 0;
  }

  return false;
}

function sanitizeAlias(alias?: string) {
  if (!alias) {
    return MULTI_FACTOR_COLUMN;
  }

  return `"${alias.replace(/"/g, '""')}"`;
}
