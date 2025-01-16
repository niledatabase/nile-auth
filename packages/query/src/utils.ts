import { EventEnum, ResponseLogger } from "@nile-auth/logger";
import { ErrorResultSet } from "./types";

// https://www.postgresql.org/docs/current/errcodes-appendix.html
enum ErrorCodes {
  unique_violation = "23505",
  syntax_error = "42601",
  invalid_param = "22023",
  ECONNREFUSED = "ECONNREFUSED",
}
export function handleFailure(
  req: Request,
  pgData?: ErrorResultSet,
  msg?: string,
) {
  const responder = ResponseLogger(req, EventEnum.QUERY);
  console.log(pgData);
  if (pgData && "code" in pgData) {
    if (pgData.code === ErrorCodes.ECONNREFUSED) {
      return responder(`Connection refused to the database.`, { status: 400 });
    }

    if (pgData.code === ErrorCodes.unique_violation) {
      return responder(`${msg} already exists.`, { status: 400 });
    }

    if (pgData.code === ErrorCodes.invalid_param) {
      if (pgData.message.includes("not found"))
        return responder("Resource not found", { status: 404 });
    }

    if (pgData.code === ErrorCodes.syntax_error) {
      return responder(`Invalid syntax: ${pgData.message}`, {
        status: 400,
      });
    }
    if ("message" in pgData && pgData.severity === "ERROR") {
      return responder(`An error has occurred: ${pgData.message}`, {
        status: 400,
      });
    }
    return responder(`An error has occurred: ${msg}`, { status: 400 });
  }

  return responder(`${msg}`, { status: 400 });
}
