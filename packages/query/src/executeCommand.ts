import { QueryResult } from "pg";

import ClientManager from "./ClientManager";
import { report } from "@nile-auth/logger";
import { cleanSql } from "../../logger/src/report";
import { ErrorCodes } from "./utils";

export type ReturnType = Error | QueryResult[];
const clientManager = new ClientManager();
type Command = { text: string; rowMode?: "array" | "none"; values?: string[] };
export async function executeCommand(params: {
  command: Command;
  user: string;
  password: string;
  database: string;
  host: string;
  port?: number;
  logger: {
    error: (...args: any) => void;
    info: (...args: any) => void;
    debug: (...args: any) => void;
    warn: (...args: any) => void;
  };
}): Promise<ReturnType> {
  const {
    logger: { info, error, debug, warn },
    command: _command,
    ...clientProps
  } = params;
  clientManager.logger = {
    debug: (...args) => debug(args),
    info: (...args) => info(args),
    error: (...args) => error(args),
    warn: (...args) => warn(args),
  };
  const timerClient = await clientManager.getClient(clientProps);
  if (timerClient.hasError) {
    return [timerClient.hasError] as unknown as QueryResult[];
  }
  const client = timerClient.getClient();

  debug("pg client retrieved");

  try {
    const start = Date.now();
    const command: Command = { ..._command };
    if (_command.rowMode !== "none") {
      command.rowMode = "array";
    }

    const logCommand = command.text
      .replace(/(\n|\r)/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const reporter = report(logCommand);

    reporter.start();
    const res = await client.query(_command).catch((e) => {
      const shouldLog =
        // Tenant auth failure is acceptable
        e?.code !== ErrorCodes.invalid_authorization_specification &&
        // Users re-inserting isn't an error to worry about
        !(
          typeof e?.message === "string" &&
          e.message.includes("users_email_key")
        );

      if (shouldLog) {
        warn("Failed command", {
          message: e.message,
          text: cleanSql(logCommand),
          error: e,
        });
      }
      const index = _command.text.indexOf(String(command.text));
      const beforeCommand = _command.text.substring(0, index);
      const lineNumber = beforeCommand.split("\n").length;

      return { ...e, message: e.message, lineNumber };
    });

    reporter.end("pg.latency", { values: _command.values?.toString() }, false);

    if (!Array.isArray(res)) {
      return [res];
    }
    return res as unknown as QueryResult[];
  } catch (e: unknown) {
    warn("Command parsing failed.", {
      message: (e as Error)?.message,
      stack: (e as Error)?.stack,
    });
    return [e as Error] as unknown as QueryResult[];
  }
}
