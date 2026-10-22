import {
  Client,
  ClientConfig,
  DatabaseError,
  QueryConfig,
  QueryResult,
} from "pg";

import { LoggerType } from "./types";

export default class ClientWithTimer {
  private timer?: NodeJS.Timeout;
  private client: Client;
  private connected: Promise<Client>;
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private closed = false;
  private stopping?: Promise<void>;
  private idleTimeout = parseInt(process.env.POOL_TIMEOUT ?? "1200000", 10);

  constructor(
    private id: string,
    private removeSelf: (id: string) => void,
    config: ClientConfig,
    private logger: LoggerType,
  ) {
    this.client = new Client(config);
    this.client.on("error", (error) => {
      this.logger.warn("Client has gone away", { error });
      this.removeSelf(this.id);
    });
    this.connected = this.client.connect();
    // Handle connection failures even if no command has started waiting yet.
    void this.connected.catch((error) => {
      this.logger.warn("client connection failed", {
        message: error.message,
        stack: error.stack,
        ...config,
        password: Boolean(config.password),
      });
      this.removeSelf(this.id);
    });
    this.startTimer();
  }

  query(command: QueryConfig): Promise<QueryResult | QueryResult[]> {
    if (this.closed) return Promise.reject(new Error("Client has gone away"));
    this.pending++;
    this.clearTimer();

    // Keep an entire command (including BEGIN/SET LOCAL/COMMIT) together.
    // pg's implicit queue is deprecated and must not be used for concurrency.
    const result = this.queue
      .then(async () => {
        if (this.closed) throw new Error("Client has gone away");
        await this.connected;
        // SQL errors may reject before ReadyForQuery updates transaction status.
        // The public drain event follows that message once our command is done.
        let ready: () => void;
        const drained = new Promise<void>((resolve) => {
          ready = resolve;
        });
        const onReady = () => ready();
        this.client.once("drain", onReady);
        this.client.once("error", onReady);
        this.client.once("end", onReady);
        try {
          return await this.client.query(command);
        } catch (error) {
          if (error instanceof DatabaseError) {
            await drained;
            // Reset aborted transactions before the next request, but avoid
            // ROLLBACK outside a transaction (which produces a server warning).
            const status = this.client.getTransactionStatus();
            if (!this.closed && (status === "T" || status === "E")) {
              try {
                await this.client.query("ROLLBACK");
              } catch (rollbackError) {
                this.logger.warn("Failed to reset client after query error", {
                  error: rollbackError as Error,
                });
                this.removeSelf(this.id);
              }
            }
          } else {
            // A connection or driver failure cannot be recovered with SQL.
            this.removeSelf(this.id);
          }
          throw error;
        } finally {
          this.client.removeListener("drain", onReady);
          this.client.removeListener("error", onReady);
          this.client.removeListener("end", onReady);
        }
      })
      .finally(() => {
        this.pending--;
        this.startTimer();
      });

    // A rejected command must not poison the queue for later requests.
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private startTimer() {
    this.clearTimer();
    // The timeout measures idle time, never time spent running or queuing SQL.
    if (this.closed || this.pending > 0) return;
    this.timer = setTimeout(() => {
      this.logger.debug("idle timeout reached. removing client");
      this.removeSelf(this.id);
    }, this.idleTimeout);
    this.timer.unref();
  }

  stop(): Promise<void> {
    if (!this.stopping) {
      this.closed = true;
      this.clearTimer();
      this.stopping = this.queue.then(async () => {
        await this.client.end().catch((error) => {
          this.logger.warn("client end failed", {
            stack: error.stack,
            message: error.message,
          });
        });
        this.logger.debug("client ended");
      });
    }
    return this.stopping;
  }
}
