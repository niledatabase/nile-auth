# Contributing to Nile-Auth

Welcome to Nile-Auth. We are glad you are interested in contributing to this project. We welcome contributions of all kinds, including bug reports, feature requests, code improvements, and documentation updates.

## Packages and Tech Stack

- `@nile-auth/server`: a [Next.js](https://nextjs.org/) app for serving REST APIs
- `@nile-auth/query`: a small wrapper around [pg node](https://node-postgres.com/) to make querying easier
- `@nile-auth/core`: a small wrapper around NextAuth(https://next-auth.js.org/) which connects to a Nile database

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

We use [`yarn`](https://yarnpkg.com/) (please avoid `npm`) and [`Turborepo`](https://turbo.build/) for managing dependencies and builds.

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



Happy coding! 🚀