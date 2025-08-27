import { Client, ClientConfig } from "pg";

import { LoggerType } from "./types";

const poolTimeout = process.env.POOL_TIMEOUT ?? "1200000";
export default class ClientWithTimer {
  timer: void | NodeJS.Timeout;
  backupTimer: void | NodeJS.Timeout;
  id: string;
  removeSelf: (id: string) => void;
  client: Client;
  config: ClientConfig;
  logger: LoggerType;
  constructor(
    id: string,
    removeSelf: (id: string) => void,
    config: ClientConfig,
    logger: LoggerType,
  ) {
    this.id = id;
    this.timer = undefined;
    this.backupTimer = undefined;
    this.startTimer();
    this.removeSelf = function (id) {
      removeSelf(id);
    };
    this.client = new Client(config);
    this.logger = logger;

    this.config = config;
    this.client.on("error", (e) => {
      this.logger.warn("Client has gone away", { error: e });
      removeSelf(id);
    });

    this.client.connect().catch(async (e) => {
      this.logger.warn("client connection failed", {
        message: e.message,
        stack: e.stack,
        ...this.config,
        password: Boolean(this.config.password),
      });
      this.removeSelf(this.id);
    });
  }

  startTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    if (this.backupTimer) {
      clearTimeout(this.backupTimer);
    }
    this.timer = setTimeout(
      async () => {
        this.logger.debug("timer reached. removing client");
        // calling pool end may also take some time, so just kill it
        this.backupTimer = setTimeout(() => {
          this.logger.debug("could not end client, garbage collecting");
          this.removeSelf(this.id);
        }, 1000);
        await this.client.end().catch((e) => {
          this.logger.warn("client end failed", {
            stack: e.stack,
            message: e.message,
          });
          this.removeSelf(this.id);
        });
        this.logger.debug("client removing self");
        this.removeSelf(this.id);
        clearTimeout(this.backupTimer);
      },
      parseInt(poolTimeout, 10),
    );
  }
  async stop() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    if (this.backupTimer) {
      clearTimeout(this.backupTimer);
    }
    await this.client.end().catch((e) => {
      this.logger.warn("client end failed", {
        stack: e.stack,
        message: e.message,
      });
    });
    this.logger.debug("client ended");
  }
  getClient(): Client {
    return this.client as Client;
  }
}
