import { EventEnum } from "./types";

type TinyBirdSchema = {
  event: EventEnum;
  database_id: string;
  time: string;
};

function mapEvent(event: EventEnum, url: URL) {
  if (url.pathname.endsWith("/auth/callback/credentials")) {
    return EventEnum.LOGIN;
  }
  switch (event) {
    case EventEnum.SIGN_UP:
      return event;
    default:
      return null;
  }
}

export function tinybird(req: Request, _event: EventEnum) {
  if (process.env.TINYBIRD_URL) {
    const url = new URL(req.url);
    const event = mapEvent(_event, url);
    if (!event) {
      return;
    }
    const [, , , databaseId] = url.pathname.split("/");
    // json to send
    const payload: TinyBirdSchema = {
      event,
      database_id: databaseId ? databaseId : "UNKNOWN",
      time: new Date().toISOString(),
    };
    // fetch(process.env.TINYBIRD_URL, {
    fetch("http://localhost:3000", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        authorization: `bearer: ${process.env.TINYBIRD_TOKEN}`,
      },
    }).catch(() => {
      // do nothing
    });
  }
}
