import { spawn, ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";

export const sessionSecret = "sql-integration-tests-only";

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (!address || typeof address === "string") {
    throw new Error("Could not allocate an HTTP port");
  }
  return address.port;
}

async function stopApp(app: ChildProcess) {
  if (!app.pid || app.exitCode !== null || app.signalCode !== null) return;
  const exited = new Promise<void>((resolve) =>
    app.once("exit", () => resolve()),
  );
  // Stop Next's worker as well as its launcher.
  const kill = (signal: NodeJS.Signals) => {
    try {
      if (app.pid) process.kill(-app.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  };
  kill("SIGTERM");
  const force = setTimeout(() => kill("SIGKILL"), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(force);
  }
}

export async function startSqlTestApp(
  options: { traceAgentUrl?: string } = {},
) {
  const connectionString = process.env.SQL_TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "SQL_TEST_DATABASE_URL is required: use a disposable PostgreSQL instance " +
        "with permission to create databases (see CONTRIBUTING.md).",
    );
  }
  const admin = new Client({ connectionString });
  await admin.connect();
  // A fresh database prevents tests from changing an existing app's data.
  const database = `nile_auth_sql_${randomUUID().replaceAll("-", "")}`;
  let created = false;
  let db: Client | undefined;
  let app: ChildProcess | undefined;
  let artifact: string | undefined;
  const stop = async () => {
    try {
      if (app) await stopApp(app);
      // Client.end() waits for the socket to close. Pool.end() can resolve
      // while its idle connection is still closing, racing the database drop.
      await db?.end();
      if (created) await admin.query(`DROP DATABASE "${database}"`);
    } finally {
      await admin.end();
      if (artifact) await rm(artifact, { recursive: true, force: true });
    }
  };

  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const dbUrl = new URL(connectionString);
    dbUrl.pathname = `/${database}`;
    db = new Client({ connectionString: dbUrl.toString() });
    await db.connect();
    await db.query(await readFile(resolve(__dirname, "schema.sql"), "utf8"));

    const origin = `http://localhost:${await freePort()}`;
    // Exercise the same Node command and traced files as the production image.
    const dockerfile = await readFile(
      resolve(__dirname, "../../Dockerfile"),
      "utf8",
    );
    const command = JSON.parse(
      dockerfile.match(/^CMD (.+)$/m)?.[1] ?? "[]",
    ) as string[];
    if (command[0] !== "dumb-init" || command[1] !== "node") {
      throw new Error("Update the SQL test launcher for the Docker entrypoint");
    }
    // Keep the artifact outside the checkout so missing traced dependencies
    // cannot accidentally resolve from the source tree's node_modules.
    artifact = await mkdtemp(join(tmpdir(), "nile-auth-sql-"));
    await cp(resolve(__dirname, "../../.next/standalone"), artifact, {
      recursive: true,
      verbatimSymlinks: true,
    });
    app = spawn(process.execPath, command.slice(2), {
      cwd: artifact,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "production",
        NODE_OPTIONS: "--throw-deprecation",
        PORT: new URL(origin).port,
        HOSTNAME: "127.0.0.1",
        NEXT_TELEMETRY_DISABLED: "1",
        NEXTAUTH_SECRET: sessionSecret,
        NEXTAUTH_URL: origin,
        NILEDB_HOST: dbUrl.hostname,
        NILEDB_PORT: dbUrl.port || "5432",
        NILEDB_USER: decodeURIComponent(dbUrl.username),
        NILEDB_PASSWORD: decodeURIComponent(dbUrl.password),
        NILEDB_NAME: database,
        DD_TRACE_ENABLED: String(Boolean(options.traceAgentUrl)),
        DD_TRACE_AGENT_URL: options.traceAgentUrl ?? "http://127.0.0.1:8126",
        DD_TRACE_AGENT_PROTOCOL_VERSION: "0.4",
        DD_TRACE_FLUSH_INTERVAL: "100",
        DD_TRACE_SAMPLE_RATE: "1",
        DD_AGENT_HOST: "127.0.0.1",
        DD_DOGSTATSD_URL: "udp://127.0.0.1:8125",
        DD_SERVICE: "nile-auth-sql-test",
        DD_ENV: "test",
        DD_INSTRUMENTATION_TELEMETRY_ENABLED: "false",
        DD_REMOTE_CONFIGURATION_ENABLED: "false",
        DD_PROFILING_ENABLED: "false",
        TINYBIRD_URL: "",
        TINYBIRD_TOKEN: "",
      },
    });
    let output = "";
    let diagnostics = "";
    const capture = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-8000);
    };
    app.stdout?.on("data", capture);
    app.stderr?.on("data", (chunk: Buffer) => {
      capture(chunk);
      diagnostics += chunk.toString();
    });
    app.once("error", (error) => {
      output += error.message;
    });

    const deadline = Date.now() + 90000;
    let ready = false;
    while (Date.now() < deadline && app.exitCode === null) {
      try {
        const response = await fetch(`${origin}/v2/ready`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.status === 200) {
          ready = true;
          break;
        }
      } catch {
        /* wait for the app to listen */
      }
      await delay(200);
    }
    if (!ready) throw new Error(`SQL test app did not start:\n${output}`);

    return {
      db,
      url: `${origin}/v2/databases/${database}`,
      output: () => output,
      diagnostics: () => diagnostics,
      dbConfig: { connectionString: dbUrl.toString() },
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
