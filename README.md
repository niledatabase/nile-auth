![Blog post cover (3) copy (1)](https://github.com/user-attachments/assets/3bb2c821-1caf-478c-868a-342e879050a2)

# Nile Auth

**Nile Auth is a multi-tenant, comprehensive, drop-in, open source authentication service built on Postgres.** Designed specifically for **multi-tenancy**, it provides a complete authentication, user management and tenant management system for B2B apps. With first-class tenant support, beautiful React components, wide variety of social logins, password authentication, email templates, and session-based authentication.

Nile-Auth repo is the authentication service. It works with [Nile's SDK](https://github.com/niledatabase/nile-js). The SDK contains the React components as well as backend routes and methods.

## Get started in a minute

This is a quick NextJS example, you can find examples for other frameworks in our [docs](https://thenile.dev/docs/auth).

### Install dependencies

```bash
npm install @niledatabase/server @niledatabase/react
```

### Create backend routes

```bash
mkdir -p app/api/\[...nile\]
```

Create following files handle the calls to your server, as well as expose the `nile` instance to your application:

`/api/[...nile]/nile.ts`

```typescript
import { Nile } from "@niledatabase/server";
export const nile = await Nile();
export const { handlers } = nile.api;
```

`/api/[...nile]/route.ts`

```typescript
import { handlers } from "./nile";
export const { POST, GET, DELETE, PUT } = handlers;
```

### Create a landing page

```jsx
import {
  SignOutButton,
  SignUpForm,
  SignedIn,
  SignedOut,
  TenantSelector,
  UserInfo,
} from "@niledatabase/react";
import "@niledatabase/react/styles.css";

export default function SignUpPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <SignedIn className="flex flex-col gap-4">
        <UserInfo />
        <TenantSelector className="py-6 mb-10" />
        <SignOutButton />
      </SignedIn>
      <SignedOut>
        <SignUpForm createTenant />
      </SignedOut>
    </div>
  );
}
```

---

## Purpose-built for multi-tenant apps

Nile Auth is purpose-built for multi-tenant apps. Users belong to one or more tenants, and each tenant has its own data. Authenticated users can access data from any tenant they have access to - this access control is enforced at all layers - from the browser to the authentication service to the database itself. All authentication features can be enabled at the application level, or disabled for a specific tenant. 

## User data stored in your DB

Keep full control of your user data by storing it directly in your own database. At Nile we believe that user information, just like tenant information, is deeply integrated with your application data and best stored in the same database. This provides security, performance and consistency across your entire stack.

## Unlimited active users

Scale your application with confidence, supporting unlimited active users at no additional cost. Some authentication services pricing depends on the number of active users, but at Nile we believe that the number of active users does not accurately reflect the value of the service. We believe that a better metric is database usage (cpu, memory, storage) and the number of **enterprise tenants** you have (as those are high value customers). Therefore we do not limit the number of active users at any pricing tier, and instead focus on aligning our pricing with your database usage and enterprise adoption.

## Comprehensive auth features

Access a full suite of authentication features to secure your application thoroughly. Here are some of the features you get out of the box:

- **Organization and User management** - With flexible React components and APIs. Managed Nile Auth also includes a dashboard for managing users and tenants.
- **Multi-tenant authentication**  - Built-in support for managing multiple tenants effortlessly.
- **Multi-framework support** - NextJS, Remix, Express, React, etc (Nuxt and Vue coming soon!).
- **UI components for embedding in your application** - simple, beautiful and flexible
- **Single Sign-On (SSO) / Social Login Support**: Optional integration with external identity providers using OIDC / OAuth (and soon, SAML)
- **Tenant overrides** - manage authentication for each tenant individually
- **Password Authentication** – Supports traditional username/password logins.
- **Email Templates** – Customizable email workflows for onboarding, recovery, etc.
- **Session Support**: Uses JWT and secure cookies to maintain user sessions. Providing world-class security, abstracted behind simple APIs and hooks.
- **PostgreSQL Backend** – Secure, scalable authentication storage.
- **Proxy-Optimized** – Designed to work with a fronting backend service for enhanced security and flexibility.

## Self-host or let Nile manage it

Choose between [self-hosting](/auth/selfhosting) for complete control or let Nile handle the management for you. And most importantly, Nile-Auth is 100% open source and will work with any PostgreSQL database. You are in control of your own user data and never have to worry about vendor lock-in.

## Drop-in Auth UI modules

Easily integrate pre-built authentication UI modules into your application with minimal effort. Nile's open source SDK includes a beautiful and flexible React components that can be embedded in your application and customized to your liking. This includes signup, login, organization switcher, user profile, social login buttons and more.

## 📖 Documentation

Check out our full documentation at [thenile.dev/docs/auth](https://thenile.dev/docs/auth) for detailed guides and API references.

## 💬 Community & Support

- **GitHub Issues** – Report bugs or request features in our [discussion board](https://github.com/orgs/niledatabase/discussions).
- **Discord** – Join our developer community [here](https://discord.com/invite/8UuBB84tTy).
- **Twitter** – Follow us [@niledatabase](https://twitter.com/niledatabase) for updates.

## Want to contribute?

Nile Auth is an open source project licensed under the MIT License. You could help continuing its development by:

- [Engage with our community](https://thenile.dev/docs/auth/help/community)
- [Suggest new features and report issues](https://thenile.dev/docs/auth/contributing/report)
- [Contribute code](https://thenile.dev/docs/auth/contributing/develop)

---

## What's inside?

A Nextjs web server that handles authentication and authorization, as well as tenant and user management.

### Apps and Packages

- `@nile-auth/server`: a [Next.js](https://nextjs.org/) app for serving REST APIs
- `@nile-auth/query`: a small wrapper around [pg node](https://node-postgres.com/) to make querying easier
- `@nile-auth/core`: a small wrapper around NextAuth(https://next-auth.js.org/) which connects to a Nile database

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

Nile Auth is free and open source project licensed under the [MIT License](./LICENSE.md). You are free to do whatever you want with it.
