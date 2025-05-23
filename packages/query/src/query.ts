import { Logger, report, ResponderFn } from "@nile-auth/logger";
import { Pool } from "pg";
import { handleQuery } from "./handleQuery";
import getDbInfo, { DbCreds } from "./getDbInfo";
import { fixPrepare } from "./context";
import { ErrorResultSet, ErrorResultSet as ErrorSet } from "./types";
import { handleFailure } from "./utils";
import { level } from "../../logger/src/logger";
import { Reporter } from "../../logger/src/report";
export { formatTime } from "./formatTime";
const { debug, error, warn } = Logger("adaptor sql");

export enum Commands {
  insert = "INSERT",
  update = "UPDATE",
  delete = "DELETE",
  create = "CREATE",
  drop = "DROP",
  alter = "ALTER",
  select = "SELECT",
  show = "SHOW",
  set = "SET",
}

export type ValidResultSet<T = Record<string, string>[]> = {
  command: Commands;
  rowCount: number;
  oid: number;
  rows: T;
  fields: {
    name: string;
    tableID: string;
    display_name: string;
    column_type_internal?: string;
  }[];
  RowCtor: null;
  rowAsArray: boolean;
};
export type ResultSet<T = Record<string, string>[]> =
  | null
  | Record<string, never>
  | ErrorSet
  | ValidResultSet<T>;

export type Primitive = string | number | boolean | string[] | Date | null;
export type SqlTemplateFn = (
  strings: TemplateStringsArray,
  ...values: Primitive[]
) => Promise<ResultSet<any>>;

export function query(pool: Pool): SqlTemplateFn {
  return async function sqlTemplate(strings, ...values) {
    let text = strings[0] ?? "";

    for (let i = 1; i < strings.length; i++) {
      text += `$${i}${strings[i] ?? ""}`;
    }
    const client = await pool.connect().catch((e) => {
      error(
        "[nile-auth][error][CONNECTION FAILED] Unable to connect to Nile. Double check your database configuration.",
        { stack: e.stack, message: e.message },
      );
    });
    try {
      const debugText = text.replace(/(\n\s+)/g, " ").trim();
      const reporter = report(debugText);

      reporter.start();
      // @ts-expect-error - allows for null args in function, but not in query
      const result = await client.query(text, values).catch((e) => {
        warn(
          "[nile-auth][error][QUERY FAILED] Unable to run query on database.",
          { stack: e.stack, message: e.message, text, values },
        );
      });

      reporter.end("pg.latency", { values: values.toString() }, false);

      return result;
    } catch (e) {
      if (e instanceof Error) {
        warn("Database went away", { stack: e.stack, message: e.message });
      }
    } finally {
      if (client) {
        await client.release();
      }
    }
  };
}

/**
 * Only supports a single query (so it's easier to surface errors)
 * @param params database and credentials for that database
 * @returns the response based on the query, or a Response for an error to return back to the client
 */
export async function queryByReq(req: Request, responder?: ResponderFn) {
  const dbInfo = getDbInfo(undefined, req);
  return sqlTemplate(dbInfo, responder) as <T = ResultSet[]>(
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ) => Promise<T>;
}
export type Params = {
  req?: Request;
  responder?: ResponderFn;
  creds?: DbCreds;
};
export async function queryBySingle({ req, responder, creds }: Params) {
  const dbInfo = getDbInfo(creds, req);
  return sqlTemplate(dbInfo, responder) as <T = Record<string, any>>(
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ) => Promise<{ rows: T[]; error?: Response }>;
}

export async function queryByInfo(creds?: DbCreds, req?: Request) {
  const dbInfo = getDbInfo(creds, req);
  return sqlTemplate(dbInfo) as <T = ResultSet[]>(
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ) => Promise<T>;
}

export type TemplateType = <T = ResultSet<Record<string, string>[]>>(
  strings: TemplateStringsArray,
  ...values: Primitive[]
) => Promise<T[]>;

export function sqlTemplate(dbInfo: DbCreds, responder?: ResponderFn) {
  return async function sqlTemplate<T = ResultSet>(
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ): Promise<Array<undefined | ResultSet> | { rows: T[]; error?: Response }> {
    let text = strings[0] ?? "";

    const [initial] = values;
    const usesContext = String(initial).startsWith(":");
    let removed = 0;
    for (let i = 1; i < strings.length; i++) {
      // context is always first, I suppose
      if (String(values[0]).startsWith(":")) {
        // we have a context, so we need to "manually" parse all the values so pgnode actually works
        text += `${String(values[0]).slice(1)}${strings[i] ?? ""}`;
        values.splice(0, 1);
        removed++;
      } else {
        if (usesContext) {
          text += `${fixPrepare(null, String(values[0]))}${strings[i] ?? ""}`;
          values.splice(0, 1);
        } else {
          text += `$${i - removed}${strings[i] ?? ""}`;
        }
      }
    }
    if (usesContext) {
      text = `BEGIN; ${text}`;
      // unset it for the next query. Later, make this smarter so a single request handles this well, or convert the `ClientManager` to use pools
      if (text[text.length - 1] !== ";") {
        text += ";";
      }
      text += `COMMIT;`;
    }
    const json = {
      text,
      values: values as string[],
    };
    let res;
    if (!dbInfo) {
      res = [
        {
          name: "error",
          message: "unable to connect to the database",
        } as ErrorSet,
      ];
    } else {
      const data = await handleQuery({
        json,
        ...dbInfo,
        rowMode: "none",
      });
      debug(text.replace(/(\n\s+)/g, " ").trim());
      // we could take out `set` as well (for context, but that is a larger change)
      res = data.filter((d) => {
        if (d && "command" in d) {
          return d && "command" in d && d?.command.toLowerCase() !== "begin";
        }
        return true;
      });
    }

    if (responder) {
      const [single] = res;
      return getRows<T>(single, responder);
    } else {
      return res.map((r) => {
        // the `set` worked in the context, so remove it. We want to return it if it failed, for errors
        if (r && "command" in r && r.command.toLowerCase() === "set") {
          return undefined;
        }
        return r;
      });
    }
  };
}
export type { ErrorResultSet } from "./types";

/**
 *
 * Safe usage of this function requires handling `error` in every impl
 * @param res response from pg
 * @param responder a logging function
 * @returns handles a query that is expected to return data. If there can be null data, don't use this and manually handle the cases.
 */
export function getRows<T = Record<string, any>>(
  res: ResultSet | undefined,
  responder: ResponderFn,
): { rows: T[]; error?: Response } {
  let rows: T[] = [];
  let error: Response | undefined;

  if (!res || !("rows" in res) || res.rows.length === 0) {
    error = responder(null, { status: 404 });
  } else if ("name" in res) {
    error = handleFailure(responder, res as unknown as ErrorResultSet);
  } else {
    rows = res.rows as T[];
  }

  return { rows, error };
}

export function getRow<T = Record<string, any>>(
  res: ResultSet | undefined,
): T | undefined {
  if (res && "rows" in res) {
    return res.rows[0] as T;
  }
}
