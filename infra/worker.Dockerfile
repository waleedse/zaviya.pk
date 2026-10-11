# Zaviya worker (discovery -> write -> QA -> publish). Build from the repo root:
#   docker build -f infra/worker.Dockerfile -t zaviya-worker .
FROM node:22-bookworm-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate \
  && apt-get update && apt-get install -y --no-install-recommends ca-certificates fonts-noto-core fonts-noto-extra \
  && rm -rf /var/lib/apt/lists/*
# Subscription writing engines: Cursor CLI (cursor-agent) and Claude Code (claude -p)
RUN apt-get update && apt-get install -y --no-install-recommends curl git \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @anthropic-ai/claude-code \
  && (curl -fsSL https://cursor.com/install | bash) \
  && ln -sf /root/.local/bin/cursor-agent /usr/local/bin/cursor-agent \
  && claude --version && cursor-agent --version
WORKDIR /app
COPY . .
# tsx runs the TypeScript directly, so dev dependencies are needed too
RUN pnpm install --frozen-lockfile --filter @zaviya/worker...
ENV NODE_ENV=production
WORKDIR /app/apps/worker
# The Chrome extension connects to this port from the Mac (published as 127.0.0.1:8787).
EXPOSE 8787
CMD ["node", "--import", "tsx", "src/index.ts"]
