# Zaviya server agents: watchdog (code) + Editor-in-Chief (Cursor / Claude CLI). Build from the repo root.
# The playbook, role files and Linear script are baked in at /app; agents get no git credentials.
FROM node:22-bookworm-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:/home/agent/.local/bin:$PATH
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate \
  && apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @anthropic-ai/claude-code \
  && useradd -m -s /bin/bash agent && mkdir -p /data && chown agent:agent /data
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/agents apps/agents
COPY ops ops
COPY .claude/agents .claude/agents
COPY docs docs
RUN pnpm install --frozen-lockfile --filter @zaviya/agents... && chown -R agent:agent /app
USER agent
RUN curl -fsSL https://cursor.com/install | bash && cursor-agent --version && claude --version
ENV AGENT_DATA=/data WORKSPACE=/app NODE_ENV=production
CMD ["pnpm", "--filter", "@zaviya/agents", "start"]
