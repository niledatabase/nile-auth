<p align="center">
 <a href="https://thenile.dev" target="_blank"><img width="96px" src="https://www.thenile.dev/about-logo.png" /></a>
 <h2 align="center">Nile Auth
  <br/>
  <img src="https://img.shields.io/npm/v/@niledatabase/server"/>
 </h2>
  <p align="center">
  User authentication and authorization for <a href="https://thenile.dev">Nile database</a>
  <br />
  <a href="https://thenile.dev/docs/auth"><strong>Learn more ↗️</strong></a>
  <br />
  <br />
  <a href="https://discord.gg/akRKRPKA">Discord</a>
  🔵
  <a href="https://thenile.dev">Website</a>
  🔵 
  <a href="https://github.com/niledatabase/nile-auth/issues">Issues</a>
 </p>
</p>

## A Fully Hosted Multi-Tenant Authentication Solution

`nile-auth` is a **drop-in authentication solution** built on top of [`next-auth`](https://next-auth.js.org/), designed specifically for **multi-tenancy**. It provides a complete authentication and user management system with first-class tenant support, password authentication, email templates, and seamless JWT-based authentication.

### ✨ Features

- **Multi-Tenant Authentication** – Built-in support for managing multiple tenants effortlessly.
- **Full `next-auth` Feature Set** – OAuth, credentials, sessions, providers, and more.
- **User & Tenant Management** – APIs for managing users and organizations.
- **Password Authentication** – Supports traditional username/password logins.
- **Email Templates** – Customizable email workflows for onboarding, recovery, etc.
- **JWT Support** – Generate and validate JWTs on the fly.
- **PostgreSQL Backend** – Secure, scalable authentication storage.
- **Proxy-Optimized** – Designed to work with a fronting backend service for enhanced security and flexibility.

## 📖 Documentation

Check out our full documentation at [thenile.dev/auth](https://thenile.dev/auth) for detailed guides and API references.

## 💬 Community & Support

- **GitHub Issues** – Report bugs or request features in our [issue tracker](https://github.com/niledatabase/nile-auth/issues).
- **Discord** – Join our developer community [here](https://discord.gg/niledatabase).
- **Twitter** – Follow us [@niledatabase](https://twitter.com/niledatabase) for updates.

---

## What's inside?

A Nextjs web server that handles authentication and authorization, as well as tenant and user management.

### Apps and Packages

- `@nile-auth/server`: a [Next.js](https://nextjs.org/) app for serving REST APIs
- `@nile-auth/query`: a small wrapper around [pg node](https://node-postgres.com/) to make querying easier
- `@nile-auth/core`: a small wrapper around NextAuth(https://next-auth.js.org/) which connects to a Nile database

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

Nile Auth is free and open source project licensed under the [MIT License](./LICENSE.md). You are free to do whatever you want with it.
