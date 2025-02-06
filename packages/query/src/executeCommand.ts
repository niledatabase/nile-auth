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
    const commands = [_command.text];

    const start = Date.now();
    const command = { ..._command, text: commands[0] };
    if (_command.rowMode !== "none") {
      command.rowMode = "array";
    }

    const logCommand = command.text
      ?.replace(/(\n|\r)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    debug(`Starting command ${logCommand} ${_command.values?.toString()}`);
    const res = await client.query(_command).catch((e) => {
      error("Failed command", {
        message: e.message,
        text: logCommand,
      });
      const index = _command.text.indexOf(String(command.text));
      const beforeCommand = _command.text.substring(0, index);
      const lineNumber = beforeCommand.split("\n").length;

      return { ...e, message: e.message, lineNumber };
    });
    const stamp = Math.floor(Date.now() - start);
    debug(`Finished command in ${stamp}ms`);

    if (!Array.isArray(res)) {
      return [res];
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
