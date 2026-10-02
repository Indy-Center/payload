# Builds the image build-and-deploy.yml pushes to ghcr.io/indy-center/payload.
# Needs `output: 'standalone'` in next.config.ts.
# From https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile

FROM node:22-alpine AS base

FROM base AS deps
# https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# .next holds the prerender cache. media and private-media hold uploads when the R2 buckets aren't
# configured; compose mounts a named volume on each, and a new volume takes the directory's owner,
# so the server can write to it.
RUN mkdir .next media private-media && chown nextjs:nodejs .next media private-media

# https://nextjs.org/docs/app/api-reference/config/next-config-js/output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
# Docker sets HOSTNAME to the container id, and server.js would listen on that address only.
ENV HOSTNAME=0.0.0.0

# server.js is created by next build from the standalone output.
CMD ["node", "server.js"]
