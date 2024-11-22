import { ClientConfig } from "pg";

import { Logger } from "@nile-auth/logger";

import ClientWithTimer from "./ClientWithTimer";
import { LoggerType } from "./types";

const { error, info, debug } = Logger("[client manager]");

export const getServerId = (config: ClientConfig) => {
  return makeServerId(config);
};
export const makeServerId = (config: ClientConfig) => {
  return Buffer.from(JSON.stringify(config)).toString("base64");
};

export default class ClientManager {
  clients: Map<string, ClientWithTimer>;
  logger: LoggerType;
  constructor() {
    this.clients = new Map();
    this.logger = {
      debug,
      info,
      error,
    };
  }

  async getClient(config: ClientConfig): Promise<ClientWithTimer> {
    const configId = makeServerId(config);
    const existing = this.clients.get(configId);
    if (existing) {
      this.logger.debug(
        `reusing existing client. total clients: ${this.clients.size}`,
      );
      existing.startTimer();
      return existing;
    }
    const client = new ClientWithTimer(
      configId,
      (id) => this.removeSelf(id),
      config,
      this.logger,
    );
    this.logger.debug("initializing client");
    this.clients.set(configId, client);
    this.logger.debug(
      `new client created. total clients: ${this.clients.size}`,
    );
    return client;
  }

  remove(config: ClientConfig) {
    const configId = makeServerId(config);
    this.clients.delete(configId);
    this.logger.debug(
      `removing client. Remaining clients: ${this.clients.size}`,
    );
  }

  async removeSelf(id: string) {
    const client = this.clients.get(id);
    await client?.stop();
    this.clients.delete(id);
    this.logger.debug(
      `client removing itself. remaining clients: ${this.clients.size}`,
    );
  }
}
