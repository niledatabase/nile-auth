import { Logger } from "@nile-auth/logger";

import { executeCommand } from "./executeCommand";
export const API_TIMEOUT = 95 * 1000; // this number needs to be reflected in vercel.json too

const { error, info, warn, debug } = Logger("[@nile-auth/query]");

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
}) {
  if (process.env.NILEDB_PORT !== "7432") {
    if (
      !host ||
      (host === "localhost" && process.env.NODE_ENV === "production")
    ) {
      error("Server is misconfigured, cannot connect to niledatabase");
      return new Response(
        "Server is misconfigured, cannot connect to niledatabase",
        { status: 500 },
      );
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
        },
      }),
    apiTimeout,
  );

  if (!data) {
    warn("query did not return any data");
    return new Response(null, { status: 408 });
  }
  debug("query returned");
  return new Response(JSON.stringify(data), { status: 200 });
}

async function within(fn: () => Promise<unknown>, duration: number) {
  try {
    const id = setTimeout(() => {
      error("Connection to khnum failed.");
      throw new Error("timeout reached");
    }, duration);

    try {
      const data = await fn();
      clearTimeout(id);
      return data;
    } catch (e) {
      clearTimeout(id);
      if (e instanceof Error) {
        error(e.message);
      }
      //@ts-expect-error - anything, I guess
      error(e.toString());
    }
  } catch (e: unknown) {
    return null;
  }
}
