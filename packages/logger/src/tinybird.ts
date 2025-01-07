import { Logger } from "./logger";
import { EventEnum } from "./types";

type TinyBirdSchema = {
  event: EventEnum;
  database_id: string;
  timestamp: string;
};
type RequestData = {
  event: EventEnum;
  url: URL;
  body: BodyInit | Response | null | undefined;
  detail?: Record<string, string | Record<string, string>>;
};

function mapEvent({
  event,
  url,
  body,
  detail,
}: RequestData): { event: EventEnum; [key: string]: string } | null {
  if (body instanceof Response && "status" in body) {
    if (body.status > 299) {
      return null;
    }
  }
  const params = new URLSearchParams(detail?.body);
  let email = url.searchParams.get("email") ?? "UNKNOWN";
  const paramEmail = params.get("email");

  if (paramEmail) {
    email = paramEmail;
  } else if (body && typeof body === "object" && "email" in body) {
    if (typeof body.email === "string") {
      email = body.email;
    }
  } else if (detail && typeof detail.body === "string") {
    try {
      const json = JSON.parse(detail.body);
      if (typeof json.email === "string") {
        email = json.email;
      }
    } catch (e) {
      // do nothing
    }
  } else if (typeof detail?.email === "string") {
    email = detail?.email;
  }

  const emailSignIn = url.pathname.endsWith("/auth/callback/email");
  const credSignIn = url.pathname.endsWith("/auth/callback/credentials");

  if (credSignIn || emailSignIn) {
    return {
      event: EventEnum.SIGN_IN,
      email,
    };
  }

  switch (event) {
    case EventEnum.SIGN_UP:
      return { event, email };
    default:
      return null;
  }
}

export async function tinybird({
  req,
  event,
  body,
  detail,
}: Omit<RequestData, "url"> & { req: Request }) {
  if (process.env.TINYBIRD_URL && process.env.TINYBIRD_TOKEN) {
    const url = new URL(req.url);
    const metricEvent = await mapEvent({ event, url, body, detail });
    if (!metricEvent) {
      return;
    }
    const { event: evt, ...remaining } = metricEvent;
    const [, , , databaseId] = url.pathname.split("/");

    const payload: TinyBirdSchema = {
      event: evt,
      database_id: databaseId ? databaseId : "UNKNOWN",
      timestamp: new Date().toISOString(),
      ...remaining,
    };

    await fetch(process.env.TINYBIRD_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${process.env.TINYBIRD_TOKEN}`,
      },
    }).catch((e) => {
      const log = Logger("TINY_BIRD" as EventEnum);
      log.error("Failed to post metrics", {
        stack: e.stack,
        message: e.message,
      });
    });
  }
}
