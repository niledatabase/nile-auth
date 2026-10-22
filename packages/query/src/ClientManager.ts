import { ClientConfig } from "pg";

import { Logger } from "@nile-auth/logger";

import ClientWithTimer from "./ClientWithTimer";
import { LoggerType } from "./types";

const { warn, error, info, debug } = Logger("[client manager]");

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
      warn,
    };
  }

  async getClient(config: ClientConfig): Promise<ClientWithTimer> {
    const configId = makeServerId(config);
    const existing = this.clients.get(configId);
    if (existing) {
      this.logger.debug(
        `reusing existing client. total clients: ${this.clients.size}`,
      );
      return existing;
    }
    const client = new ClientWithTimer(
      configId,
      (id) => this.removeSelf(id, client),
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
    return this.removeSelf(makeServerId(config));
  }

  async removeSelf(id: string, expected?: ClientWithTimer) {
    const client = this.clients.get(id);
    if (!client || (expected && client !== expected)) return;
    // Evict before closing so new requests cannot reuse a retiring client.
    this.clients.delete(id);
    await client.stop();
    this.logger.debug(
      `client removing itself. remaining clients: ${this.clients.size}`,
    );
  }
}
