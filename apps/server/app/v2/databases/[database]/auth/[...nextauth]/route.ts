import { NextRequest } from "next/server";

import NileAuth from "@nile-auth/core";
import { Logger, ResponseLogger } from "@nile-auth/logger";

const { error } = Logger("[next-auth]");

function serializeHeaders(headers: Headers) {
  const serializedHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    serializedHeaders[key] = value;
  });
  return serializedHeaders;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { database: string; nextauth: string[] } },
) {
  const responder = ResponseLogger(req);
  try {
    const res = await NileAuth(req, { params });

    const details = {
      requestHeaders: serializeHeaders(req.headers),
      responseHeaders: serializeHeaders(res.headers),
      body: await res.clone().text(),
    };

    if (res.status > 303) {
      error(res);
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
      error("Failure occurred in nextauth post", {
        error: e.message,
        stack: e.stack,
      });
    }
    return responder(null, { status: 404 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { database: string; nextauth: string[] } },
) {
  const responder = ResponseLogger(req);
  try {
    const body = req.clone();

    const res = await NileAuth(req, { params });
    const details = {
      requestHeaders: serializeHeaders(req.headers),
      responseHeaders: serializeHeaders(res.headers),
      body: await new Response(body.body).text(),
      href: req.nextUrl.href,
    };

    if (res.status > 303) {
      error(res);
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
      error("Failure occurred in nextauth post", {
        error: e.message,
        stack: e.stack,
      });
    }
    return responder(null, { status: 404 });
  }
}
