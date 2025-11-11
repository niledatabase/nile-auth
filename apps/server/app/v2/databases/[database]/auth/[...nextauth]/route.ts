import { NextRequest } from "next/server";

import NileAuth from "@nile-auth/core";
import { EventEnum, Logger, ResponseLogger } from "@nile-auth/logger";
import { getOrigin, getSecureCookies } from "@nile-auth/core/cookies";

const log = Logger(EventEnum.NILE_AUTH);

// logging only, don't actually use this
function serializeHeaders(headers: Headers) {
  const serializedHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (serializedHeaders[key]) {
      const prev = serializedHeaders[key];
      serializedHeaders[key] = [prev, value].join(", ");
    } else {
      serializedHeaders[key] = value;
    }
  });
  return serializedHeaders;
}

async function getDetails(req: NextRequest, res: Response) {
  return {
    requestHeaders: serializeHeaders(req.headers),
    responseHeaders: serializeHeaders(res.headers),
    body: sanitizeBody(await res.clone().text()),
    href: req.nextUrl?.href ?? req.url,
    nileOrigin: String(getOrigin(req)),
    status: String(res.status),
  };
}
const sanitizeBody = (body: string) => {
  // may remove more than we want, but more is better than none
  return body.replace(/password=([^&#]*)/, "password=***&");
};
export async function GET(
  req: NextRequest,
  { params }: { params: { database: string; nextauth: string[] } },
) {
  const [responder, reporter] = ResponseLogger(req, EventEnum.NILE_AUTH_GET);
  try {
    const res = await NileAuth(req, { params });

    const details = await getDetails(req, res);

    if (res.status > 303) {
      log.warn("Bad nextauth get", { details });
    }

    if (res.status === 302) {
      const location = res.headers.get("location");
      const cookies = res.headers.get("set-cookie");
      const headers = new Headers({
        location: location,
        "Set-Cookie": cookies,
      });
      return responder(
        null,
        {
          headers,
          status: 201,
        },
        details,
      );
    } else {
      return responder(res, undefined, details);
    }
  } catch (e) {
    if (e instanceof Error) {
      log.error("Failure occurred in nextauth get", {
        error: e.message,
        stack: e.stack,
        cause: e.cause,
      });
    }
    reporter.error();
    return responder(null, { status: 404 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { database: string; nextauth: string[] } },
) {
  const [responder, reporter] = ResponseLogger(req, EventEnum.NILE_AUTH_POST);
  try {
    const res = await NileAuth(req, { params });
    const details = await getDetails(req, res);

    if (res.status > 303) {
      log.warn("Bad nextauth post", { details });
    }

    if (res.status === 302) {
      const location = res.headers.get("location");
      const cookies = res.headers.get("set-cookie");
      const headers = new Headers({ location });
      if (cookies) {
        headers.set("Set-Cookie", cookies);
      }
      return responder(
        null,
        {
          headers,
          status: 200,
        },
        details,
      );
    } else {
      return responder(res, undefined, details);
    }
  } catch (e) {
    if (e instanceof Error) {
      log.error("Failure occurred in nextauth post", {
        error: e.message,
        stack: e.stack,
        cause: e.cause,
      });
    }
    reporter.error();
    return responder(null, { status: 404 });
  }
}
