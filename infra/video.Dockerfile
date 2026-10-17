# Zaviya video service: renders the daily headline videos (Remotion) and posts them as Reels.
# A SEPARATE image and container from the news worker: its own CPU/memory limits, no claude/cursor CLIs.
# Build from the repo root:
#   docker build -f infra/video.Dockerfile -t zaviya-video .
FROM node:22-bookworm-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Remotion's chrome-headless-shell needs these shared libraries (https://www.remotion.dev/docs/miscellaneous/linux-dependencies)
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate \
  && apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-noto-core \
    libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 \
    libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @zaviya/worker... --filter @zaviya/video...
# The browser, our synthesized music (the WAVs are not in git) and the composition bundle are made at BUILD time:
# nothing is downloaded or bundled while rendering.
WORKDIR /app/packages/video
RUN npx remotion browser ensure \
  && ln -s "$(find /app/packages/video/node_modules/.remotion -type f -name chrome-headless-shell | head -1)" /usr/local/bin/chrome-headless-shell \
  && pnpm audio \
  && pnpm bundle \
  && rm -rf out fixtures/images public/fixtures-images
ENV NODE_ENV=production \
    VIDEO_BROWSER_EXECUTABLE=/usr/local/bin/chrome-headless-shell
WORKDIR /app/apps/worker
VOLUME /data/videos
CMD ["node", "--import", "tsx", "src/video/main.ts"]
