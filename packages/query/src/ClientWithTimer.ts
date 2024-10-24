import { Client, ClientConfig } from "pg";

import { LoggerType } from "./types";

const poolTimeout = process.env.POOL_TIMEOUT ?? "1200000";
export default class ClientWithTimer {
  timer: void | NodeJS.Timeout;
  backupTimer: void | NodeJS.Timeout;
  id: string;
  removeSelf: (id: string) => void;
  hasError: Error | void;
  client: Client;
  tries: number;
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
    this.tries = 0;
    this.removeSelf = function (id) {
      removeSelf(id);
    };
    this.client = new Client(config);
    this.logger = logger;

    this.config = config;
    this.hasError = undefined;
    this.client.on("error", (e) => {
      this.logger.error(e.message, { error: e });
      removeSelf(id);
    });

    this.client.connect().catch(async (e) => {
      this.logger.error("client connection failed", {
        message: e.message,
        stack: e.stack,
        ...this.config,
        password: Boolean(this.config.password),
      });
      await this.client.end();
      this.tries++;
      this.hasError = e;
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
          this.logger.error(e);
          // still remove, because of the next time.
          this.logger.error("client end failed");
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
      this.logger.error(e);
      // still remove, because of the next time.
      this.logger.info("client end failed");
    });
    this.logger.debug("client ended");
  }
  getClient(): Client {
    return this.client as Client;
  }
}
