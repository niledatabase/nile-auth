import { Logger } from "@nile-auth/logger";
import { ResponseLogger } from "@nile-auth/logger";
import { Pool } from "pg";
import { handleQuery } from "./handleQuery";
import getDbInfo from "./getDbInfo";
export { formatTime } from "./formatTime";
const { debug } = Logger("adaptor sql");

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

export type ErrorResultSet = {
  cmd: string;
  code: string;
  file: string;
  length: number;
  line: string;
  message: string;
  name: "error";
  position: string;
  routine: string;
  severity: "ERROR";
  lineNumber: string;
};
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
  | ErrorResultSet
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
      console.error(e);
      // eslint-disable-next-line no-console
      console.error(
        "[nile-auth][error][CONNECTION FAILED]",
        "Unable to connect to Nile. Double check your database configuration.",
      );
    });
    // @ts-expect-error - allows for null args in function, but not in query
    // return { text, values };
    const result = await client.query(text, values).catch((e) => {
      // eslint-disable-next-line no-console
      console.error(
        "[nile-auth][error][QUERY FAILED]",
        "Unable to run query on database.",
        e,
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
  ): Promise<ResultSet> {
    let text = strings[0] ?? "";

    for (let i = 1; i < strings.length; i++) {
      text += `$${i}${strings[i] ?? ""}`;
    }
    const json = {
      text,
      values: values as string[],
    };
    if (!dbInfo) {
      return {
        name: "error",
        message: "unable to connect to the database",
      } as ErrorResultSet;
    } else {
      const data = await handleQuery({
        json,
        ...dbInfo,
        rowMode: "none",
      });

      debug(text.replace(/(\n\s+)/g, " ").trim());
      const body = await new Response(data.body).json();
      return body[0];
    }
  };
}

// https://www.postgresql.org/docs/current/errcodes-appendix.html
enum ErrorCodes {
  unique_violation = "23505",
  syntax_error = "42601",
}
export function handleFailure(
  req: Request,
  pgData?: ErrorResultSet,
  msg?: string,
) {
  const responder = ResponseLogger(req);
  if (pgData && "code" in pgData) {
    if (pgData.code === ErrorCodes.unique_violation) {
      return responder(`${msg} already exists.`, { status: 400 });
    }
    if (pgData.code === ErrorCodes.syntax_error) {
      return responder(`Invalid syntax: ${pgData.message}`, {
        status: 400,
      });
    }
    if ("message" in pgData && pgData.severity === "ERROR") {
      return responder(`An error has occurred: ${pgData.message}`, {
        status: 400,
      });
    }
    return responder(`An error has occurred: ${msg}`, { status: 400 });
  }

  return responder(`${msg}`, { status: 400 });
}
