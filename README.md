  <p align="center">
<a href="https://thenile.dev" target="_blank"><img width="96px" src="https://www.thenile.dev/about-logo.png" /></a>

<h2>Nile Auth</h2>
User authentication and authorization for <a href="https://thenile.dev">Nile database</a>
    <br />
    <a href="https://thenile.dev/docs/auth"><strong>Learn more »</strong></a>
    <br />
    <br />
    <a href="https://discord.gg/akRKRPKA">Discord</a>
    ·
    <a href="https://thenile.dev">Website</a>
    ·
    <a href="https://github.com/niledatabase/nile-auth/issues">Issues</a>

  </p>

🚧 This project is in alpha and not yet recommended for production use. 🚧

## Using this service

First, update `compose.yaml` with a set of developer credentials and region, which can be obtained at [here](console.thenile.dev).

```yaml
services:
  nile-auth-server:
    container_name: nile-auth-server
    build:
      context: .
      dockerfile: ./apps/server/Dockerfile
    environment:
      NODE_ENV: production
      NEXT_TELEMETRY_DISABLED: 1
      NILEDB_HOST: <the db region url>
      NILEDB_USER: <UUID>
      NILEDB_PASSWORD: <UUID>
    ports:
      - 3001:3001
```

Then build/start the container.

```bash
docker compose up --build
```

## What's inside?

A Nextjs web server that handles authentication and authorization, as well as tenant and user management.

### Apps and Packages

- `@nile-auth/server`: a [Next.js](https://nextjs.org/) app for serving REST APIs
- `@nile-auth/query`: a small wrapper around [pg node](https://node-postgres.com/) to make querying easier
- `@nile-auth/core`: a small wrapper around NextAuth(https://next-auth.js.org/) which connects to a Nile database

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

Nile Auth is free and open source project licensed under the [MIT License](./LICENSE.md). You are free to do whatever you want with it.
