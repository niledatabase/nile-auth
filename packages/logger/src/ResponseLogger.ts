import { report, Reporter } from "./report";
import { tinybird } from "./tinybird";
import { Logger } from "./logger";
import { EventEnum } from "./types";
const { setMetadata, info } = Logger("response logger");

export type ResponderFn = (
  body: Response | BodyInit | null | undefined,
  init?: ResponseInit | undefined,
  detail?: Record<string, string | Record<string, string>>,
) => Response;

export function ResponseLogger(
  req: Request,
  event: EventEnum,
): [ResponderFn, Reporter] {
  const reporter = report(req);
  reporter.start();
  return [
    function Responder(body, init, detail): Response {
      const url = new URL(req.url);
      setMetadata({ event });
      info(`[${req.method ?? "GET"}] ${url.pathname}`, {
        ...detail,
        init,
      });
      tinybird({ req, event, body, detail });
      reporter.end();
      const status = init?.status ?? 200;
      if (status) {
        reporter.response(status);
      }
      if (!(body instanceof Response)) {
        return new Response(body, init);
      }
      reporter.ok();
      return body;
    },
    reporter,
  ];
}
