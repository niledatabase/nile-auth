import {
  format,
  createLogger,
  transports,
  Logger as WinstonLogger,
} from "winston";

const colorizer = format.colorize();
const level =
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
            "silly",
            `\n[${timestamp}] ${level}: ${key}: ${JSON.stringify(meta[key], null, 2)}`,
          );
        }
        return colorizer.colorize(
          "silly",
          `\n[${timestamp}] ${level}: ${key}: ${JSON.stringify(JSON.parse(meta[key]), null, 2)}`,
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

type LogType = (
  message: string,
  meta?:
    | undefined
    | Record<
        string,
        string | number | BodyInit | object | undefined | null | unknown
      >,
) => WinstonLogger;
type SillyLog = (params: object) => WinstonLogger;

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

export function Logger(endpoint: string) {
  logger.defaultMeta = { endpoint };

  const error = (...msg: any) => {
    const metadata = formatError(msg);
    logger.error(msg[0], { endpoint, error: msg, ...metadata });
  };
  const debug: LogType = logger.debug;
  const info: LogType = logger.info;
  const warn: LogType = logger.warn;
  const silly: SillyLog = logger.silly;

  return { info, warn, debug, error, silly };
}

const { info } = Logger("response logger");

type ResponderFn = (
  body?: Response | BodyInit | null | undefined,
  init?: ResponseInit | undefined,
  detail?: Record<string, string | Record<string, string>>,
) => Response;

export function ResponseLogger(req: Request, event: EventEnum): ResponderFn {
  return function Responder(body, init, detail): Response {
    const url = new URL(req.url);
    logger.defaultMeta = { event };
    info(`[${req.method ?? "GET"}] ${url.pathname}`, { ...detail, init });
    if (!(body instanceof Response)) {
      return new Response(body, init);
    }
    return body;
  };
}

export enum EventEnum {
  CREATE_USER = "CREATE_USER",
  GET_DB_INFO = "GET_DB_INFO",
  ME = "ME",
  NILE_AUTH = "NILE_AUTH",
  LOGIN = "LOGIN",
  SIGN_UP = "SIGN_UP",
  CREATE_TENANT = "CREATE_TENANT",
  UPDATE_TENANT = "UPDATE_TENANT",
  DELETE_TENANT = "DELETE_TENANT",
  LIST_TENANT = "LIST_TENANT",
  LIST_TENANTS = "LIST_TENANTS",
  LIST_USERS = "LIST_USERS",
  LIST_TENANT_USERS = "LIST_TENANT_USERS",
  CREATE_TENANT_USER = "CREATE_TENANT_USER",
  UPDATE_TENANT_USER = "UPDATE_TENANT_USER",
  LINK_USER = "LINK_USER",
  UNLINK_USER = "UNLINK_USER",
  QUERY = "QUERY",
}
