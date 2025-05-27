import { report, Reporter } from "./report";
import { tinybird } from "./tinybird";
import { Logger } from "./logger";
import { EventEnum } from "./types";
const { setMetadata, info, warn } = Logger("response logger");

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
      const logLine = `[${req.method ?? "GET"}] ${url.pathname}`;
      tinybird({ req, event, body, detail });
      reporter.end();
      const status = init?.status ?? 200;
      if (body instanceof Response) {
        reporter.response(status);
      } else if (status) {
        reporter.response(status);
      }
      if (!(body instanceof Response)) {
        if (typeof body === "string") {
          try {
            // these are good cases, not just string errors being sent from some error
            const json = JSON.parse(body);
            if (json) {
              info(logLine, {
                ...detail,
                init,
              });
            }
          } catch {
            warn(logLine, {
              ...detail,
              init,
              body,
              req,
            });
          }
        } else {
          info(logLine, {
            ...detail,
            init,
            body,
          });
        }
        return new Response(body, init);
      }
      reporter.ok();
      info(logLine, {
        ...detail,
        init,
      });
      return body;
    },
    reporter,
  ];
}
