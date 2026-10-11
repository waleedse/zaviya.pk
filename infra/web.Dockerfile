# Zaviya web (Next.js + Payload) — build from the repo root:
#   docker build -f infra/web.Dockerfile -t zaviya-web .
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
WORKDIR /app

FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile --filter @zaviya/web...
# `--target deps` gives a tools image for Payload CLI jobs (migrations, seed).
WORKDIR /app/apps/web

FROM deps AS build
WORKDIR /app
# Public build-time values (canonical URLs, analytics, WhatsApp channel)
ARG NEXT_PUBLIC_SITE_URL=https://zaviya.pk
ARG NEXT_PUBLIC_WHATSAPP_CHANNEL_URL=
ARG NEXT_PUBLIC_ADSENSE_CLIENT=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_WHATSAPP_CHANNEL_URL=$NEXT_PUBLIC_WHATSAPP_CHANNEL_URL NEXT_PUBLIC_ADSENSE_CLIENT=$NEXT_PUBLIC_ADSENSE_CLIENT
# Static pages are pre-rendered at build time, so the build needs a reachable database.
# docker-compose.yml passes the Compose Postgres (build runs on the host network); the
# ARG only exists in this build stage and never reaches the final image.
ARG BUILD_DATABASE_URL=postgres://build:build@localhost:5432/build
ENV DATABASE_URL=$BUILD_DATABASE_URL PAYLOAD_SECRET=build-only
RUN pnpm --filter @zaviya/web build

# Run straight from the build stage: copying /app (node_modules included) into a fresh
# stage doubles several GB on disk and can exhaust a small Docker VM.
FROM build AS run
# Drop the build-only database settings; the real ones come from the container environment.
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DATABASE_URL= PAYLOAD_SECRET=
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start", "-p", "3000"]
