# Contributing to Nile-Auth

Welcome to Nile-Auth. We are glad you are interested in contributing to this project. We welcome contributions of all kinds, including bug reports, feature requests, code improvements, and documentation updates.

## Packages and Tech Stack

- `@nile-auth/server`: a [Next.js](https://nextjs.org/) app for serving REST APIs
- `@nile-auth/query`: a small wrapper around [pg node](https://node-postgres.com/) to make querying easier
- `@nile-auth/core`: a small wrapper around NextAuth(https://next-auth.js.org/) which connects to a Nile database

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

We use [`yarn`](https://yarnpkg.com/) (please avoid `npm`) and [`Turborepo`](https://turbo.build/) for managing dependencies and builds.

Use Node.js 22.19 or newer on a supported LTS release and Yarn 4.8.1. The
Docker image uses Node.js 24. The runtime security update keeps Jest 29,
otplib 12 (including the existing `thirty-two` patch), and Datadog's maintained
5.x release line. Optional major upgrades are reviewed separately.

## Getting Started

You can read a more detailed guide in our [documentation](https://thenile.dev/docs/auth/contributing/develop)

1. **Fork the Repository**  
   Click the "Fork" button on GitHub to create your own copy of the repo.

2. **Clone the Repo**

   ```sh
   git clone https://github.com/your-username/nile-auth.git
   cd nile-auth
   ```

3. **Install Dependencies**

   ```sh
   yarn install 
   ```

4. Run the Development Server

    ```sh
        yarn dev
    ```

## Reporting issues

Whether you run into issues with Nile Auth itself or while attempting to contribute, we are here for you.

- **GitHub Issues** – Report bugs or request features in our [discussion board](https://github.com/orgs/niledatabase/discussions).
- **Discord** – Join our developer community [here](https://discord.com/invite/8UuBB84tTy).

If you run into security issues, we prefer you contact [support@thenile.dev](mailto:support@thenile.dev) privately. We'll look into it with priority and give you full credit for discovery.

## Contribution Guidelines

- **Feature Requests & Issues**: Open a GitHub issue to discuss before starting work.
- **Pull Requests**:
  - Create a feature branch (`git checkout -b feature/your-feature`).
  - Follow existing code style and linting rules.
  - Add tests where applicable.
  - Submit a PR with a clear description.
- **Code of Conduct**: Be respectful and constructive in discussions.
  
## Testing

Review our [testing guide](https://thenile.dev/docs/auth/contributing/testing) for suggestions on how to test Nile Auth.

Run `yarn test`, `yarn lint`, and `yarn build` before submitting dependency
updates. Tests cover existing 10-byte authenticator secrets, the accepted clock
drift window, MFA and recovery codes, and SMTP delivery to a local test server.
The separate SDK integration test needs a configured database and is excluded
from the default run.

### SQL regression tests

Run `yarn test:sql` against a disposable PostgreSQL 17 instance. This command
builds and starts the production standalone server used by the Docker image,
sends HTTP requests to `/users`, `/signup` and auth routes, and checks the saved
rows and password hashes. It uses the production query and authentication code
without mocking database results. CI runs it as a required step before tagging
or publishing images.

For example, start a local test database:

```sh
docker run --rm --detach --name nile-auth-sql-tests \
  --publish 127.0.0.1:7433:5432 --env POSTGRES_PASSWORD=postgres postgres:17
docker exec nile-auth-sql-tests pg_isready -U postgres
SQL_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:7433/postgres yarn test:sql
docker stop nile-auth-sql-tests
```

Wait for `pg_isready` to report that PostgreSQL is accepting connections before
running the tests. The supplied connection needs `CREATE DATABASE` permission.
Each run creates and drops a uniquely named database and starts the app on an
available loopback port; it does not use the app's `.env` database credentials.
An absent or unusable `SQL_TEST_DATABASE_URL` fails the suite instead of skipping
it. These tests prove the covered queries execute on PostgreSQL and enforce the
application's membership checks; Nile's native tenant isolation still needs
testing against Nile.

Runtime regression cases also check concurrent queries, per-request tenant and
user context, rollback after a failed transaction, and idle or disconnected
client recovery. The SQL test runner and the server process it launches treat
Node.js deprecations as failures. The standalone build is copied outside the
checkout before starting it, so missing packaged dependencies cannot resolve
from source files.

## Datadog tracing

For dev and prod deployments through Nile's infrastructure, the cluster's
Datadog admission controller already supplies service tags and agent connection
settings, including `DD_SERVICE`, `DD_TRACE_AGENT_URL`, and `DD_DOGSTATSD_URL`.
The agent endpoints use mounted Unix sockets. Deploying Nile Auth requires no
additional Datadog environment configuration or agent setup.

The application initializes its bundled `dd-trace` SDK. The Docker startup
command preloads `apps/server/tracing.cjs` before loading Next.js, inheriting the
settings supplied by the cluster. This startup order enables the Next.js
integration. HTTP and PostgreSQL spans can already be present when the SDK
reports that Next.js loaded too early, so those spans alone do not verify the
Next.js integration.

Local `yarn dev` and `yarn start:server` use the normal Next.js commands and do
not preload `tracing.cjs`. The `yarn test:sql` runtime cases explicitly run the
Docker startup command against a local fake Datadog agent over a Unix socket.
They verify actual Next.js request spans and HTTP custom metrics with test
service tags. These tests need no Datadog account, credentials, or running
cluster agent.

## Dependency security

Run `yarn audit:security` to check every workspace and transitive dependency,
including development tools. Two advisories have no published patched release:

- [`braces` / GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
  affects deeply nested glob patterns used by source discovery and tools. The
  application supplies fixed source globs.
- [`sprintf-js` / GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
  affects attacker-controlled precision specifiers and remains under legacy
  `argparse` dependencies.

These findings are not suppressed. The `basic-ftp` resolution selects a patched
6.x version because `get-uri` still requests the affected 5.x line. NextAuth 4's
optional Nodemailer peer range targets 7.x; the service uses Nodemailer 10 with
its own delivery implementation, covered by the SMTP test.



Happy coding! 🚀
