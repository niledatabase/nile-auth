import { Logger } from "@nile-auth/logger";
import { Pool } from "pg";
import { handleQuery } from "./handleQuery";
import getDbInfo from "./getDbInfo";
import { fixPrepare } from "./context";
import { ErrorResultSet as ErrorSet } from "./types";
export { formatTime } from "./formatTime";
const { debug, error } = Logger("adaptor sql");

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
export function query(pool: Pool) {
  return async function sqlTemplate(
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ): Promise<ResultSet<any>> {
    let text = strings[0] ?? "";

    for (let i = 1; i < strings.length; i++) {
      text += `$${i}${strings[i] ?? ""}`;
    }
    const client = await pool.connect().catch((e) => {
      // eslint-disable-next-line no-console
      // eslint-disable-next-line no-console
      error(
        "[nile-auth][error][CONNECTION FAILED]",
        "Unable to connect to Nile. Double check your database configuration.",
        { stack: e.stack, message: e.message },
      );
    });
    // @ts-expect-error - allows for null args in function, but not in query
    // return { text, values };
    const result = await client.query(text, values).catch((e) => {
      // eslint-disable-next-line no-console
      error(
        "[nile-auth][error][QUERY FAILED]Unable to run query on database.",
        { stack: e.stack, message: e.message },
      );
    });
    debug("[SQL]", {
      text: text.replace(/(\n\s+)/g, " ").trim(),
      ...(values.length ? { values } : {}),
    });
    if (client) {
      await client.release();
    }
    return result;
  };
}

/**
 * Only supports a single query (so it's easier to surface errors)
 * @param params database and credentials for that database
 * @returns the response based on the query, or a Response for an error to return back to the client
 */
export async function queryByReq(req: Request) {
  const dbInfo = getDbInfo(undefined, req);
  return async function sqlTemplate(
    strings: TemplateStringsArray,
    ...values: Primitive[]
  ): Promise<ResultSet[]> {
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
      // unset it for the next query. Later, make this smarter so a single request handles this well, or convert the `ClientManager` to use pools
      if (text[text.length - 1] !== ";") {
        text += ";";
      }
      text += `RESET nile.user_id; RESET nile.tenant_id;`;
    }
    const json = {
      text,
      values: values as string[],
    };
    if (!dbInfo) {
      return [
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
      return data;
    }
  };
}

export type { ErrorResultSet } from "./types";
