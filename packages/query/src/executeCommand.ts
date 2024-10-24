import { QueryResult } from "pg";

import ClientManager from "./ClientManager";

type ReturnType = Error | QueryResult[] | void;
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
    return timerClient.hasError;
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
    const data: ReturnType[] = [];
    debug("number of commands to be run", cleanedCommands.length);
    let shouldStop = false;
    for (const cmd of cleanedCommands) {
      if (shouldStop) {
        info("Error occurred on previous command. No additional commands run.");
        break;
      }
      const start = Date.now();
      const command = { ..._command, text: cmd };
      if (_command.rowMode !== "none") {
        command.rowMode = "array";
      }

      debug("Starting command");
      const res = await client.query(command).catch((e) => {
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
      data.push({ ...res, cmd } as ReturnType);
      const stamp = Math.floor(Date.now() - start);
      debug(`Finished command in ${stamp}ms`);
    }
    return data as unknown as QueryResult[];
  } catch (e: unknown) {
    error("Command parsing failed.", {
      message: (e as Error)?.message,
      stack: (e as Error)?.stack,
    });
    return e as Error;
  }
}
