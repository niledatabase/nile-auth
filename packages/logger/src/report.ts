import { Logger } from "./logger";
import tracer from "dd-trace";

const { debug, warn } = Logger("metrics");

type Tag = "env" | "service" | "status" | "url";

type Tags = {
  [tag in Tag]: string | number;
};

type Metrics = "http.latency" | "http.response.count";

try {
  tracer.init({
    tags: { env: process.env.DD_ENV, service: process.env.DD_SERVICE },
  });
  tracer.use("next");
} catch (e) {
  warn("failed to configure UDS. NOT LOGGING TO DATADOG");
}
export function report(req: Request) {
  const metrics = tracer.dogstatsd;
  const url = cleanUrl(req);
  return {
    time: process.hrtime(),
    url,
    start() {
      this.time = process.hrtime();
    },

    end() {
      const delay = delayToMs(process.hrtime(this.time));
      this.send("http.latency", delay);
    },

    response(status: number) {
      this.send("http.response.count", 1, { status });
    },

    send(metric: Metrics, value: number, tags?: Partial<Tags>) {
      const _tags = {
        ...(tags ? tags : {}),
        url,
      };
      debug(`${metric} ${value} ${JSON.stringify(_tags)}`);
      try {
        metrics.distribution(metric, value, _tags);
      } catch (e) {
        // just development (probably)
      }
    },
  };
}

// app/server takes care of any kind of garbage that could be put into the path, so using this strings is deterministic
export function cleanUrl(req: Request): string {
  const path = new URL(req.url).pathname;

  const splitPath = path.split("/");
  const staticPath = splitPath.map((val, idx) => {
    if (idx === 3) {
      return "{database_id}";
    }
    if (idx === 5) {
      if (splitPath[4] === "tenants") {
        return "{tenant_id}";
      } else if (splitPath[4] === "users") {
        return "{user_id}";
      }
    }
    if (idx === 7) {
      return "{user_id}";
    }

    return val;
  });
  // protect us from random garbage
  return staticPath.join("/") as Metrics;
}

function delayToMs(hrtime: [number, number]) {
  return hrtime[0] * 1000 + hrtime[1] / 1000000;
}
