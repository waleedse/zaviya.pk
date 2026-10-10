# @zaviya/worker

BullMQ pipeline worker for Zaviya: ingest → embed → triage → write → QA → media → publish → social.

## Run

```bash
# From repo root (Redis on localhost:6379)
pnpm --filter @zaviya/worker dev

# Production-style
pnpm --filter @zaviya/worker start
```

Copy `.env.example` to `.env` and set `PAYLOAD_API_KEY` when the Payload bot user exists. Without API keys, LLM and social integrations log and skip.

## Required services

- **Redis** — job queues (local on Mac is fine)
- **Payload** — `PAYLOAD_URL` + bot API key for pipeline REST
- **Ollama** (optional primary LLM) — `ollama pull qwen3:4b` etc.
- **Gemini** (optional fallback) — `GEMINI_API_KEY`

## CLI

```bash
pnpm --filter @zaviya/worker exec tsx src/cli.ts ingest-once
pnpm --filter @zaviya/worker exec tsx src/cli.ts triage <clusterId>
pnpm --filter @zaviya/worker exec tsx src/cli.ts write <clusterId>
pnpm --filter @zaviya/worker exec tsx src/cli.ts bench [fixture.json|clusterId]
```

## launchd (Mac)

Run the worker under `caffeinate` with a plist pointing at `pnpm --filter @zaviya/worker start`, loading `.env` from this directory. See `infra/` in the monorepo for sample plists when added.
