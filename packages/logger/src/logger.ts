import {
  format,
  createLogger,
  transports,
  Logger as WinstonLogger,
} from "winston";
import { EventEnum } from "./types";

const colorizer = format.colorize();
export const level =
  process.env.NODE_ENV === "production"
    ? (process.env.LOG_LEVEL ?? "info")
    : "silly";
const prodFormat = format.combine(format.timestamp(), format.json());
const devFormat = format.combine(
  format.timestamp({
    format: "YYYY-MM-DD hh:mm:ss.SSS A",
  }),
  format.align(),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const metas = Object.keys(meta).map((key, idx) => {
      try {
        if (typeof meta[key] === "object") {
          return colorizer.colorize(
            level,
            `\n[${timestamp}] ${level}: ${key}: ${JSON.stringify(meta[key], null, 2)}`,
          );
        }
        return colorizer.colorize(
          level,
          `\n[${timestamp}] ${level}: ${key}: ${JSON.stringify(JSON.parse(String(meta[key])), null, 2)}`,
        );
      } catch (e) {
        // do nothing
      }
      return `${idx > 0 ? "\n" : ""} ${key}: ${meta[key]}`;
    });
    return `[${timestamp}] ${level}: ${message} ${metas ? `${metas}` : ""}`;
  }),
  format.colorize({ all: true }),
);

export class UnknownError extends Error {
  code: string;
  constructor(error: Error | string) {
    // Support passing error or string
    super((error as Error)?.message ?? error);
    this.name = "UnknownError";
    this.code = (error as any).code;
    if (error instanceof Error) {
      this.stack = error.stack;
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
    };
  }
}
function hasErrorProperty(
  x: unknown,
): x is { error: Error; [key: string]: unknown } {
  return !!(x as any)?.error;
}

function formatError(o: unknown): {
  message?: string;
  stack: string | undefined | unknown;
  name?: string;
} {
  if (o instanceof Error && !(o instanceof UnknownError)) {
    return { message: o.message, stack: o.stack, name: o.name };
  }
  if (hasErrorProperty(o)) {
    o.error = formatError(o.error) as Error;
    o.message = o.message ?? o.error.message;
  }
  return { stack: o };
}

const logger = createLogger({
  level,
  format: process.env.NODE_ENV === "production" ? prodFormat : devFormat,
  transports: [new transports.Console()],
  exceptionHandlers: [new transports.Console()],
});
logger.setMaxListeners(15);

export function Logger(endpoint: string): {
  info: (message: string, ...meta: any[]) => WinstonLogger;
  warn: (message: string, ...meta: any[]) => WinstonLogger;
  debug: (message: string, ...meta: any[]) => WinstonLogger;
  error: (...msg: any) => WinstonLogger;
  silly: (message: string, ...meta: any[]) => WinstonLogger;
  setMetadata: (params: { event: EventEnum }) => void;
} {
  return {
    info: logger.info.bind(logger),
    warn: logger.warn.bind(logger),
    debug: logger.debug.bind(logger),
    error: (...msg: any) => {
      const metadata = formatError(msg);
      if (typeof msg[1] === "object") {
        logger.error(msg[0], { endpoint, ...msg[1], ...metadata });
      } else {
        logger.error(msg[0], { endpoint, error: msg, ...metadata });
      }
      return logger;
    },
    silly: logger.silly.bind(logger, { endpoint }),
    setMetadata: (params) => {
      logger.defaultMeta = params;
    },
  };
}

export { report } from "./report";
