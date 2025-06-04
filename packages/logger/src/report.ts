import { level, Logger } from "./logger";
import tracer from "dd-trace";

const { debug, warn, error } = Logger("metrics");

type Tag = "env" | "service" | "status" | "url" | "values";

type Tags = {
  [tag in Tag]: string | number;
};

type Metrics =
  | "pg.latency"
  | "http.latency"
  | "http.response.count"
  | "http.failure";

try {
  tracer.init({
    tags: { env: process.env.DD_ENV, service: process.env.DD_SERVICE },
  });
  tracer.use("next");
} catch (e) {
  warn("failed to configure UDS. NOT LOGGING TO DATADOG");
}

export type Reporter = {
  time: [number, number];
  url: string | void;
  start(): void;
  end(metricName?: Metrics, tags?: Partial<Tags>, sendMetric?: boolean): void;
  response(status: number): void;
  error(e?: unknown): void;
  ok(): void;
  send(
    metric: Metrics,
    value: number,
    tags?: Partial<Tags>,
    sendMetric?: boolean,
  ): void;
};
export function report(req: Request | string): Reporter {
  const metrics = tracer.dogstatsd;
  const url = cleanUrl(req);
  return {
    time: process.hrtime(),
    url,
    start() {
      this.time = process.hrtime();
    },

    end(metricName = "http.latency", tags = {}, sendMetric = true) {
      const delay = delayToMs(process.hrtime(this.time));
      this.send(metricName, delay, tags, sendMetric);
    },

    response(status: number) {
      this.send("http.response.count", 1, { status });
    },

    error(e) {
      if (e instanceof Error) {
        error("Request failed", {
          message: e.message,
          stack: e.stack,
          ...("details" in e ? { details: e.details } : {}),
        });
      }
      this.send("http.failure", 1);
    },
    ok() {
      this.send("http.failure", 0);
    },

    send(
      metric: Metrics,
      value: number,
      tags?: Partial<Tags>,
      sendMetric = true,
    ) {
      // remove values for production logging
      const { values, ...remaining } = tags ?? {};
      if (!url) {
        error("Not logging metrics", { metric, value, tags });
        return;
      }
      const _tags: Partial<Tags> = {
        ...(tags ? remaining : {}),
        url,
      };

      if (level === "silly") {
        _tags.values = values;
      }

      if (metric.includes("latency") && value > 100) {
        warn(metric, { value, tags: _tags });
      } else {
        debug(metric, { value, tags: _tags });
      }

      try {
        if (sendMetric) {
          metrics.distribution(metric, value, _tags);
        }
      } catch (e) {
        // just development (probably)
      }
    },
  };
}

// app/server takes care of any kind of garbage that could be put into the path, so using this strings is deterministic
export function cleanUrl(req: Request | string): void | string {
  if (req instanceof Request || (typeof req === "object" && "url" in req)) {
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
  return cleanSql(req);
}

export function cleanSql(command: void | string) {
  if (!command) {
    return;
  }
  const cmd = command?.split(";");
  if (!cmd) {
    return;
  }
  let cleanedCommand = command;
  if (cmd[3]) {
    cleanedCommand = cmd[3];
  }

  return cleanedCommand.replace(/'[^']*'/g, "[redacted]");
}

function delayToMs(hrtime: [number, number]) {
  return hrtime[0] * 1000 + hrtime[1] / 1000000;
}
