# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npm-ca,target=/run/secrets/npm-ca,required=false \
  if [ -f /run/secrets/npm-ca ]; then \
    NODE_EXTRA_CA_CERTS=/run/secrets/npm-ca npm ci --no-audit --no-fund --fetch-retries=5; \
  else \
    npm ci --no-audit --no-fund --fetch-retries=5; \
  fi

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=npm-ca,target=/run/secrets/npm-ca,required=false \
  if [ -f /run/secrets/npm-ca ]; then \
    NODE_EXTRA_CA_CERTS=/run/secrets/npm-ca npx prisma generate; \
  else \
    npx prisma generate; \
  fi
RUN npm run build

FROM base AS migrator
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=1001:1001 prisma ./prisma
RUN groupadd --system --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --no-create-home --shell /usr/sbin/nologin nextjs
USER nextjs
CMD ["node", "/app/node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM base AS runner
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --no-create-home --shell /usr/sbin/nologin nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
