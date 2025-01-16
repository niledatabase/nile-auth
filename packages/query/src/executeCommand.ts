import { QueryResult } from "pg";

import ClientManager from "./ClientManager";

export type ReturnType = Error | QueryResult[];
const clientManager = new ClientManager();

export async function executeCommand(params: {
  command: { text: string; rowMode?: "array" | "none"; values?: string[] };
  user: string;
  password: string;
  database: string;
  host: string;
  port?: number;
  logger: {
    error: (...args: any) => void;
    info: (...args: any) => void;
    debug: (...args: any) => void;
  };
}): Promise<ReturnType> {
  const {
    logger: { info, error, debug },
    command: _command,
    ...clientProps
  } = params;
  clientManager.logger = {
    debug: (...args) => debug(args),
    info: (...args) => info(args),
    error: (...args) => error(args),
  };
  const timerClient = await clientManager.getClient(clientProps);
  if (timerClient.hasError) {
    return [timerClient.hasError] as unknown as QueryResult[];
  }
  const client = timerClient.getClient();

  debug("pg client retrieved");

  try {
    const commands = _command.text.split(";");
    const cleanedCommands = commands
      .map((cmd) => {
        return cmd.trim();
      })
      .map((cmd) => {
        return cmd.replace(/--.*/gim, "").trim();
      })
      .map((cmd) => {
        // remove comments, db can't handle them - this may not be true, but too scared to remove
        // https://stackoverflow.com/a/15123777
        // https://www.techonthenet.com/postgresql/comments.php
        const blockCommentsRemoved = cmd.replace(
          /\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm,
          "",
        );
        return blockCommentsRemoved;
      })
      .filter(Boolean);
    debug(`number of commands to be run: ${cleanedCommands.length}`);
    let shouldStop = false;
    const cmd = "";
    // for (const cmd of cleanedCommands) {
    if (shouldStop) {
      info("Error occurred on previous command. No additional commands run.");
      // break;
    }
    const start = Date.now();
    const command = { ..._command, text: cmd };
    if (_command.rowMode !== "none") {
      command.rowMode = "array";
    }

    debug(`Starting command ${_command.text} ${_command.values?.toString()}`);
    const res = await client.query(_command).catch((e) => {
      // attempt to sanitize syntax errors for actionable failures
      // https://www.postgresql.org/docs/current/errcodes-appendix.html
      const validErrorCodes = [
        "08",
        "2F000",
        "3D000",
        "3F000",
        "53",
        "54",
        "55",
        "57",
        "XX",
      ];
      for (const code of validErrorCodes) {
        if (e.code?.startsWith(code) || e.code === code) {
          error("Failed command", e.message);
        } else {
          info("Failed command", e, command);
          shouldStop = true;
        }
      }
      const index = _command.text.indexOf(cmd);
      const beforeCommand = _command.text.substring(0, index);
      const lineNumber = beforeCommand.split("\n").length;

      return { ...e, cmd, message: e.message, lineNumber };
    });
    const stamp = Math.floor(Date.now() - start);
    debug(`Finished command in ${stamp}ms`);
    // }
    if (!Array.isArray(res)) {
      // in the case this is an error, we're reasonably sure the last command is the one that caused the error.
      // when queries are destructured, we need to map the error back, but the error only comes as an object, so fill and insert
      return [...new Array(cleanedCommands.length - 1).fill(null), res];
    }
    return res as unknown as QueryResult[];
  } catch (e: unknown) {
    error("Command parsing failed.", {
      message: (e as Error)?.message,
      stack: (e as Error)?.stack,
    });
    return [e as Error] as unknown as QueryResult[];
  }
}
