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
  if (url.pathname.endsWith("/auth/callback/credentials")) {
    return {
      event: EventEnum.SIGN_IN,
      email: params.get("email") ?? "UNKNOWN",
    };
  }
  switch (event) {
    case EventEnum.SIGN_UP:
      return { event, email: String(detail?.email) ?? "UNKNOWN" };
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
