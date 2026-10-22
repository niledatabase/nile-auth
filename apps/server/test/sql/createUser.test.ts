import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { sessionSecret, startSqlTestApp } from "./app";

type SqlTestApp = Awaited<ReturnType<typeof startSqlTestApp>>;
let app: SqlTestApp;
let tenantId: string;
let otherTenantId: string;
let member: string;
let outsider: string;

const password = "test-password-'\\-123";
const profile = {
  email: "new-user@example.test",
  password,
  name: "New User",
  givenName: "New",
  familyName: "User",
  picture: "https://example.test/avatar.png",
};

async function state() {
  const { rows } = await app.pool.query(`
    SELECT
      (SELECT count(*)::int FROM users.users) AS users,
      (SELECT count(*)::int FROM auth.credentials) AS credentials,
      (SELECT count(*)::int FROM public.tenants) AS tenants,
      (SELECT count(*)::int FROM users.tenant_users) AS memberships
  `);
  return rows[0];
}

async function session(userId: string, kind: "jwt" | "opaque" = "jwt") {
  const sid = randomUUID();
  await app.pool.query(
    `INSERT INTO auth.sessions (session_token, user_id, expires_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
    [sid, userId],
  );
  if (kind === "opaque") return `nile.session-token=${sid}`;
  const token = await encode({
    token: { id: userId, sub: userId, sid },
    secret: sessionSecret,
    maxAge: 3600,
  });
  return `nile.session-token=${token}`;
}

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

async function csrf() {
  const response = await fetch(`${app.url}/auth/csrf`, {
    headers: { "nile-origin": new URL(app.url).origin },
  });
  await expectStatus(response, 200);
  const { csrfToken } = await response.json();
  expect(typeof csrfToken).toBe("string");
  return { cookie: cookies(response), csrfToken };
}

async function create(
  endpoint: "users" | "signup",
  params: Record<string, string> = {},
  cookie = "",
  body: Record<string, unknown> = profile,
) {
  if (endpoint === "signup") {
    const token = await csrf();
    cookie = [cookie, token.cookie].filter(Boolean).join("; ");
  }
  return fetch(`${app.url}/${endpoint}?${new URLSearchParams(params)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "nile-origin": new URL(app.url).origin,
      cookie,
    },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(60000),
  });
}

async function expectStatus(response: Response, expected: number) {
  expect({
    status: response.status,
    error:
      response.status === expected ? undefined : await response.clone().text(),
  }).toEqual({ status: expected, error: undefined });
}

async function assertUser(response: Response, expectedTenants: string[]) {
  const user = await response.json();
  expect(user).toMatchObject({
    email: profile.email,
    name: profile.name,
    givenName: profile.givenName,
    familyName: profile.familyName,
    picture: profile.picture,
    emailVerified: null,
    multiFactor: null,
    tenants: expectedTenants,
  });
  const saved = await app.pool.query(
    "SELECT * FROM users.users WHERE id = $1",
    [user.id],
  );
  expect(saved.rows).toHaveLength(1);
  expect(saved.rows[0]).toMatchObject({
    email: profile.email,
    given_name: profile.givenName,
  });
  const credential = await app.pool.query(
    `SELECT method, provider, payload->>'email' AS email,
       payload->>'hash' = public.crypt($2, payload->>'hash') AS valid_password
     FROM auth.credentials WHERE user_id = $1`,
    [user.id, password],
  );
  expect(credential.rows).toEqual([
    {
      method: "EMAIL_PASSWORD",
      provider: "nile",
      email: profile.email,
      valid_password: true,
    },
  ]);
  const memberships = await app.pool.query(
    "SELECT tenant_id, email FROM users.tenant_users WHERE user_id = $1 ORDER BY tenant_id",
    [user.id],
  );
  expect(memberships.rows).toEqual(
    expectedTenants.map((id) => ({ tenant_id: id, email: profile.email })),
  );
  return user;
}

beforeAll(async () => {
  app = await startSqlTestApp();
});
afterAll(async () => {
  await app?.stop();
});

beforeEach(async () => {
  await app.pool.query(`
    TRUNCATE users.users, auth.credentials, auth.sessions,
      public.tenants, users.tenant_users, auth.tenant_oidc_relying_parties;
  `);
  tenantId = randomUUID();
  otherTenantId = randomUUID();
  member = randomUUID();
  outsider = randomUUID();
  await app.pool.query(
    "INSERT INTO public.tenants (id, name) VALUES ($1, 'Target'), ($2, 'Other')",
    [tenantId, otherTenantId],
  );
  await app.pool.query(
    `INSERT INTO users.users (id, email, name) VALUES
      ($1, 'member@example.test', 'Member'), ($2, 'outsider@example.test', 'Outsider')`,
    [member, outsider],
  );
  await app.pool.query(
    "INSERT INTO users.tenant_users (tenant_id, user_id) VALUES ($1, $2), ($3, $4)",
    [tenantId, member, otherTenantId, outsider],
  );
});

describe.each(["users", "signup"] as const)(
  "POST /%s with real PostgreSQL queries",
  (endpoint) => {
    const createdStatus = endpoint === "users" ? 201 : 200;

    it("rejects anonymous access to an existing tenant without creating any records", async () => {
      const before = await state();
      const response = await create(endpoint, { tenantId });
      await expectStatus(response, 401);
      expect(await state()).toEqual(before);
    });

    it("rejects a member of a different tenant without creating any records", async () => {
      const before = await state();
      const response = await create(
        endpoint,
        { tenantId },
        await session(outsider),
      );
      await expectStatus(response, 403);
      expect(await state()).toEqual(before);
    });

    it("does not treat a tenant cookie as authorization", async () => {
      const before = await state();
      const response = await create(
        endpoint,
        { tenantId },
        `nile.tenant_id=${tenantId}`,
      );
      await expectStatus(response, 401);
      expect(await state()).toEqual(before);
    });

    it("checks authorization before disclosing whether an email already exists", async () => {
      const before = await state();
      const response = await create(
        endpoint,
        { tenantId },
        await session(outsider),
        {
          ...profile,
          email: "member@example.test",
        },
      );
      await expectStatus(response, 403);
      expect(await state()).toEqual(before);
    });

    it("lets an active member create a user only in the requested tenant", async () => {
      const response = await create(
        endpoint,
        { tenantId },
        await session(member),
      );
      await expectStatus(response, createdStatus);
      await assertUser(response, [tenantId]);
    });

    it("accepts an active member's opaque database session", async () => {
      const response = await create(
        endpoint,
        { tenantId },
        await session(member, "opaque"),
      );
      await expectStatus(response, createdStatus);
      await assertUser(response, [tenantId]);
    });

    it("rejects a deleted membership", async () => {
      await app.pool.query(
        "UPDATE users.tenant_users SET deleted = CURRENT_TIMESTAMP WHERE user_id = $1",
        [member],
      );
      const before = await state();
      const response = await create(
        endpoint,
        { tenantId },
        await session(member),
      );
      await expectStatus(response, 403);
      expect(await state()).toEqual(before);
    });

    it("rejects a deleted tenant", async () => {
      await app.pool.query(
        "UPDATE public.tenants SET deleted = CURRENT_TIMESTAMP WHERE id = $1",
        [tenantId],
      );
      const before = await state();
      const response = await create(
        endpoint,
        { tenantId },
        await session(member),
      );
      await expectStatus(response, 403);
      expect(await state()).toEqual(before);
    });

    it("rejects a nonexistent tenant even when the caller belongs to another tenant", async () => {
      const before = await state();
      const response = await create(
        endpoint,
        { tenantId: randomUUID() },
        await session(member),
      );
      await expectStatus(response, 403);
      expect(await state()).toEqual(before);
    });

    it("rejects a deleted caller", async () => {
      const cookie = await session(member);
      await app.pool.query(
        "UPDATE users.users SET deleted = CURRENT_TIMESTAMP WHERE id = $1",
        [member],
      );
      const before = await state();
      const response = await create(endpoint, { tenantId }, cookie);
      await expectStatus(response, 401);
      expect(await state()).toEqual(before);
    });

    it("rejects a revoked session", async () => {
      const cookie = await session(member);
      await app.pool.query("DELETE FROM auth.sessions WHERE user_id = $1", [
        member,
      ]);
      const before = await state();
      const response = await create(endpoint, { tenantId }, cookie);
      await expectStatus(response, 401);
      expect(await state()).toEqual(before);
    });

    it("rejects a JWT whose stored session has expired", async () => {
      const cookie = await session(member);
      await app.pool.query(
        "UPDATE auth.sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE user_id = $1",
        [member],
      );
      const before = await state();
      const response = await create(endpoint, { tenantId }, cookie);
      await expectStatus(response, 401);
      expect(await state()).toEqual(before);
    });

    it("keeps anonymous user creation working without a tenant", async () => {
      const response = await create(endpoint);
      await expectStatus(response, createdStatus);
      await assertUser(response, []);
    });

    it("keeps anonymous creation of a brand new tenant working", async () => {
      const response = await create(endpoint, { newTenantName: "New tenant" });
      await expectStatus(response, createdStatus);
      const created = await app.pool.query(
        "SELECT id FROM public.tenants WHERE name = 'New tenant'",
      );
      expect(created.rows).toHaveLength(1);
      await assertUser(response, [created.rows[0].id]);
    });

    it.each(["12345", "' OR true; --"])(
      "rejects malformed tenant ID %p before writing records",
      async (invalidId) => {
        const before = await state();
        const response = await create(
          endpoint,
          { tenantId: invalidId },
          await session(member),
        );
        await expectStatus(response, 400);
        expect(await state()).toEqual(before);
      },
    );

    it("rejects ambiguous existing and new tenant parameters before writing records", async () => {
      const before = await state();
      const response = await create(endpoint, {
        tenantId,
        newTenantName: "Another tenant",
      });
      await expectStatus(response, 400);
      expect(await state()).toEqual(before);
    });

    it("fails closed when the membership query cannot execute", async () => {
      const before = await state();
      const cookie = await session(member);
      await app.pool.query(
        "ALTER TABLE users.tenant_users RENAME COLUMN user_id TO unavailable_user_id",
      );
      try {
        const response = await create(endpoint, { tenantId }, cookie);
        await expectStatus(response, 500);
        expect(await state()).toEqual(before);
      } finally {
        await app.pool.query(
          "ALTER TABLE users.tenant_users RENAME COLUMN unavailable_user_id TO user_id",
        );
      }
    });
  },
);

it("stores quoted profile values as data and produces a working login", async () => {
  const body = {
    ...profile,
    email: "o'hara@example.test",
    name: "Robert'); DROP TABLE users.users; --",
  };
  const response = await create("users", {}, "", body);
  await expectStatus(response, 201);
  const user = await response.json();
  expect(user.name).toBe(body.name);
  expect(user.email).toBe(body.email);
  expect(
    (
      await app.pool.query("SELECT name FROM users.users WHERE id = $1", [
        user.id,
      ])
    ).rows[0].name,
  ).toBe(body.name);
  const token = await csrf();
  const login = await fetch(`${app.url}/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: token.cookie },
    body: JSON.stringify({
      email: body.email,
      password,
      csrfToken: token.csrfToken,
    }),
    redirect: "manual",
  });
  expect(login.status).toBe(200);
  expect(cookies(login)).toContain("nile.session-token=");
  const me = await fetch(`${app.url}/me`, {
    headers: { cookie: cookies(login) },
  });
  expect(me.status).toBe(200);
  expect(await me.json()).toMatchObject({ id: user.id, email: body.email });
});

it("supports the pre-MFA schema through the actual information_schema fallback", async () => {
  await app.pool.query("ALTER TABLE users.users DROP COLUMN multi_factor");
  try {
    const response = await create("users", { tenantId }, await session(member));
    await expectStatus(response, 201);
    await assertUser(response, [tenantId]);
  } finally {
    await app.pool.query(
      "ALTER TABLE users.users ADD COLUMN multi_factor text",
    );
  }
});

it("creates a user without password credentials when no password was supplied", async () => {
  const body = { ...profile, password: undefined };
  const response = await create("users", {}, "", body);
  await expectStatus(response, 201);
  const user = await response.json();
  expect(user.tenants).toEqual([]);
  expect(
    (
      await app.pool.query(
        "SELECT * FROM auth.credentials WHERE user_id = $1",
        [user.id],
      )
    ).rows,
  ).toEqual([]);
});

it.each([
  [null, "Existing users must verify their email address."],
  [new Date(), "The user existing@example.test already exists"],
])(
  "checks existing SSO users with email_verified = %p using real credential rows",
  async (verified, message) => {
    const id = randomUUID();
    await app.pool.query(
      "INSERT INTO users.users (id, email, email_verified) VALUES ($1, 'existing@example.test', $2)",
      [id, verified],
    );
    await app.pool.query(
      "INSERT INTO auth.credentials (user_id, method, provider) VALUES ($1, 'OIDC', 'google')",
      [id],
    );
    const before = await state();
    const response = await create("users", {}, "", {
      ...profile,
      email: "existing@example.test",
    });
    await expectStatus(response, 400);
    expect(await response.text()).toBe(message);
    expect(await state()).toEqual(before);
  },
);

it.each([{}, { email: "invalid email" }])(
  "rejects invalid user input %p before writing records",
  async (body) => {
    const before = await state();
    const response = await create("users", {}, "", body);
    await expectStatus(response, 400);
    expect(await state()).toEqual(before);
  },
);
