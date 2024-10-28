FROM node:20-alpine AS base

# This Dockerfile is copy-pasted into our main docs at /docs/handbook/deploying-with-docker.
# Make sure you update both files!

FROM base AS builder

RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app

RUN yarn global add turbo
COPY . .
# build with node_modules, because I could not figure out pnp
RUN echo 'nodeLinker: "node-modules"' > ./.yarnrc.yml
RUN turbo prune @nile-auth/server --docker

FROM base AS installer

RUN corepack enable
RUN corepack prepare yarn@4.5.0 --activate

RUN apk update
RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY --from=builder /app/out/json/ .
RUN yarn install
COPY --from=builder /app/out/full/ .
RUN yarn turbo build --filter=@nile-auth/server...

FROM base AS runner

RUN apk add dumb-init
RUN corepack enable
RUN corepack prepare yarn@4.5.0 --activate

WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=installer --chown=nextjs:nodejs /app/apps/server/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/server/.next/static ./apps/server/.next/static

EXPOSE 3001

CMD PORT=3001 dumb-init node apps/server/server.js