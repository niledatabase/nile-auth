import { randomUUID } from "node:crypto";
import { createServer, Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client, QueryResult } from "pg";
import ClientManager from "../../../../packages/query/src/ClientManager";
import { startSqlTestApp } from "./app";

type SqlTestApp = Awaited<ReturnType<typeof startSqlTestApp>>;
let app: SqlTestApp;
let manager: ClientManager;
let agent: Server;
let agentDirectory: string;
const payloads: Buffer[] = [];
const metrics: Buffer[] = [];
const contentTypes: Array<string | undefined> = [];
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

async function until(condition: () => boolean, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() >= deadline)
      throw new Error("Timed out waiting for runtime test condition");
    await delay(20);
  }
}

beforeAll(async () => {
  // Capture real tracer payloads locally; no Datadog account or agent is needed.
  agent = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    if (request.url === "/v0.4/traces") {
      contentTypes.push(request.headers["content-type"]);
      payloads.push(Buffer.concat(chunks));
    } else if (request.url === "/dogstatsd/v2/proxy") {
      metrics.push(Buffer.concat(chunks));
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ rate_by_service: {} }));
  });
  // The deployed admission controller supplies Unix sockets, not localhost TCP.
  agentDirectory = await mkdtemp(join(tmpdir(), "nile-auth-dd-"));
  const socket = join(agentDirectory, "apm.socket");
  await new Promise<void>((resolve, reject) => {
    agent.once("error", reject);
    agent.listen(socket, resolve);
  });
  app = await startSqlTestApp({
    traceAgentUrl: `unix://${socket}`,
    dogstatsdUrl: `unix://${join(agentDirectory, "dsd.socket")}`,
  });
});

afterAll(async () => {
  await app?.stop();
  if (agent)
    await new Promise<void>((resolve, reject) =>
      agent.close((error) => (error ? reject(error) : resolve())),
    );
  if (agentDirectory)
    await rm(agentDirectory, { recursive: true, force: true });
});

beforeEach(() => {
  manager = new ClientManager();
  manager.logger = logger;
  jest.clearAllMocks();
});

afterEach(async () => {
  await manager.remove(app.dbConfig);
  jest.restoreAllMocks();
});

it("instruments Next.js requests using the injected agent Unix socket configuration", async () => {
  const path = "/v2/ready";
  const response = await fetch(new URL(path, app.url));
  expect(response.status).toBe(200);
  expect(app.output() + app.diagnostics()).not.toMatch(
    /loaded before dd-trace|next integration will not be applied/i,
  );
  await until(() =>
    payloads.some(
      (body) =>
        // Protocol 0.4 encodes span names and HTTP paths as MessagePack strings.
        body.includes(Buffer.from("next.request")) &&
        body.includes(Buffer.from(path)),
    ),
  );
  expect(contentTypes).toContain("application/msgpack");
  expect(
    payloads.some((body) => body.includes(Buffer.from("nile-auth-sql-test"))),
  ).toBe(true);
});

it("runs concurrent contextual commands on one connection without pg's deprecated queue", async () => {
  expect(process.throwDeprecation).toBe(true);
  const contexts = Array.from({ length: 40 }, () => ({
    tenant: randomUUID(),
    user: randomUUID(),
  }));
  const results = await Promise.all(
    contexts.map(async ({ tenant, user }) => {
      const client = await manager.getClient(app.dbConfig);
      const result = (await client.query({
        text: `
      BEGIN;
      SET LOCAL nile.tenant_id = '${tenant}';
      SET LOCAL nile.user_id = '${user}';
      SELECT current_setting('nile.tenant_id') AS tenant,
             current_setting('nile.user_id') AS "user",
             pg_backend_pid() AS pid, pg_sleep(0.005);
      COMMIT;
    `,
      })) as QueryResult[];
      return result[3]?.rows[0];
    }),
  );
  expect(results.map(({ tenant, user }) => ({ tenant, user }))).toEqual(
    contexts,
  );
  expect(new Set(results.map(({ pid }) => pid)).size).toBe(1);
  expect(manager.clients.size).toBe(1);
});

it("rolls back a failed transaction before the next queued command and clears its context", async () => {
  const client = await manager.getClient(app.dbConfig);
  await client.query({
    text: "CREATE TEMP TABLE rollback_probe (value integer)",
  });
  const results = await Promise.allSettled([
    client.query({
      text: `
      BEGIN;
      SET LOCAL nile.tenant_id = '${randomUUID()}';
      INSERT INTO rollback_probe VALUES (1);
      SELECT 1 / 0;
      COMMIT;
    `,
    }),
    client.query({
      text: `
      SELECT count(*)::int AS count,
        COALESCE(NULLIF(current_setting('nile.tenant_id', true), ''), 'unset') AS tenant
      FROM rollback_probe
    `,
    }),
  ]);
  expect(results[0]).toMatchObject({
    status: "rejected",
    reason: { code: "22012" },
  });
  expect(results[1]).toMatchObject({
    status: "fulfilled",
    value: { rows: [{ count: 0, tenant: "unset" }] },
  });
  expect(await manager.getClient(app.dbConfig)).toBe(client);
});

it.each([
  ["SELECT 1 / 0", "22012"],
  ["BEGIN; SELEC 1; COMMIT;", "42601"],
])(
  "recovers from %s without issuing a rollback outside a transaction",
  async (text, code) => {
    // Observe actual pg notices without replacing the driver or its results.
    const events = jest.spyOn(Client.prototype, "emit");
    const client = await manager.getClient(app.dbConfig);
    await expect(client.query({ text })).rejects.toMatchObject({ code });
    expect(await client.query({ text: "SELECT 1 AS value" })).toMatchObject({
      rows: [{ value: 1 }],
    });
    expect(events.mock.calls.filter(([event]) => event === "notice")).toEqual(
      [],
    );
  },
);

it("keeps active and queued commands alive past the idle timeout, then retires the idle connection", async () => {
  const previous = process.env.POOL_TIMEOUT;
  let client;
  try {
    process.env.POOL_TIMEOUT = "50";
    client = await manager.getClient(app.dbConfig);
  } finally {
    if (previous === undefined) delete process.env.POOL_TIMEOUT;
    else process.env.POOL_TIMEOUT = previous;
  }
  const results = (await Promise.all([
    client.query({ text: "SELECT pg_sleep(0.15), 1 AS value" }),
    client.query({ text: "SELECT pg_sleep(0.15), 2 AS value" }),
  ])) as QueryResult[];
  expect(results.map((result) => result.rows[0].value)).toEqual([1, 2]);
  await until(() => manager.clients.size === 0);
  const replacement = await manager.getClient(app.dbConfig);
  expect(replacement).not.toBe(client);
  expect(await replacement.query({ text: "SELECT 3 AS value" })).toMatchObject({
    rows: [{ value: 3 }],
  });
});

it("replaces a disconnected cached connection", async () => {
  const client = await manager.getClient(app.dbConfig);
  const result = (await client.query({
    text: "SELECT pg_backend_pid() AS pid",
  })) as QueryResult;
  await app.db.query("SELECT pg_terminate_backend($1)", [result.rows[0].pid]);
  await until(() => manager.clients.size === 0);
  const replacement = await manager.getClient(app.dbConfig);
  expect(replacement).not.toBe(client);
  expect(await replacement.query({ text: "SELECT 1 AS value" })).toMatchObject({
    rows: [{ value: 1 }],
  });
});

it("settles active and queued requests when the database disconnects, then reconnects", async () => {
  const client = await manager.getClient(app.dbConfig);
  const result = (await client.query({
    text: "SELECT pg_backend_pid() AS pid",
  })) as QueryResult;
  const requests = Promise.allSettled([
    client.query({ text: "SELECT pg_sleep(30)" }),
    client.query({ text: "SELECT 2 AS value" }),
  ]);
  const killed = await app.db.query(
    "SELECT pg_terminate_backend($1) AS killed",
    [result.rows[0].pid],
  );
  expect(killed.rows[0].killed).toBe(true);
  expect((await requests).map(({ status }) => status)).toEqual([
    "rejected",
    "rejected",
  ]);
  await until(() => manager.clients.size === 0);
  const replacement = await manager.getClient(app.dbConfig);
  expect(await replacement.query({ text: "SELECT 1 AS value" })).toMatchObject({
    rows: [{ value: 1 }],
  });
});

it("serves concurrent user creation requests without the pg warning", async () => {
  const emails = Array.from(
    { length: 20 },
    () => `${randomUUID()}@concurrency.example.test`,
  );
  const responses = await Promise.all(
    emails.map((email) =>
      fetch(`${app.url}/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "concurrency-test-password" }),
      }),
    ),
  );
  const statuses = await Promise.all(
    responses.map(async (response) => {
      const body = await response.text();
      return { status: response.status, error: response.ok ? undefined : body };
    }),
  );
  expect(statuses).toEqual(
    emails.map(() => ({ status: 201, error: undefined })),
  );
  const saved = await app.db.query(
    "SELECT email FROM users.users WHERE email = ANY($1::text[])",
    [emails],
  );
  expect(saved.rows.map(({ email }) => email).sort()).toEqual(emails.sort());
  expect(app.diagnostics()).not.toMatch(
    /Calling client\.query\(\).*deprecated/,
  );
});

it("delivers HTTP metrics through the injected agent Unix socket", async () => {
  const response = await fetch(`${app.url}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `${randomUUID()}@metrics.example.test`,
      password: "metrics-test-password",
    }),
  });
  await response.text();
  expect(response.status).toBe(201);
  // The Node SDK flushes custom metrics every ten seconds via the agent proxy.
  await until(
    () =>
      metrics.some(
        (body) =>
          body.includes(Buffer.from("http.response.count:")) &&
          body.includes(Buffer.from("service:nile-auth-sql-test")),
      ),
    20000,
  );
});
