import { Logger } from "@nile-auth/logger";

import { executeCommand } from "./executeCommand";
import { ResultSet } from "./query";
export const API_TIMEOUT = 95 * 1000; // this number needs to be reflected in vercel.json too

const { error, info, warn, debug } = Logger("@nile-auth/query");

export async function handleQuery({
  json,
  user,
  password,
  database,
  host,
  port = 5432,
  rowMode = "array",
  apiTimeout = API_TIMEOUT,
}: {
  json: { text: string; values: string[] };
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
  rowMode?: "array" | "none";
  apiTimeout?: number;
}): Promise<ResultSet[]> {
  if (process.env.NILEDB_PORT !== "7432") {
    if (
      !host ||
      (host === "localhost" && process.env.NODE_ENV === "production")
    ) {
      error("Server is misconfigured, cannot connect to niledatabase");
    }
  }
  const data = await within(
    async () =>
      await executeCommand({
        command: {
          text: json.text,
          values: json.values,
          rowMode,
        },
        database,
        user,
        password,
        host,
        port,
        logger: {
          error,
          debug,
          info,
          warn,
        },
      }).catch((e) => {
        error(e);
      }),
    apiTimeout,
  ).catch(() => {
    //noop, its logged below
  });

  if (!data) {
    warn("query did not return any data");
    return [];
  }
  debug("query returned");
  return data as ResultSet[];
}

async function within(fn: () => Promise<unknown>, duration: number) {
  try {
    const id = setTimeout(() => {
      warn("Connection to niledb failed.");
      throw new Error("timeout reached");
    }, duration);

    try {
      const data = await fn();
      clearTimeout(id);
      return data;
    } catch (e) {
      clearTimeout(id);
      if (e instanceof Error) {
        warn("timeout error", { message: e.message, stack: e.stack });
      }
      warn("Unknown error has occurred while handling a query", {
        error: (e as Error).toString(),
      });
    }
  } catch (e: unknown) {
    return [null];
  }
}
