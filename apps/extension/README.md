# @zaviya/extension

Chrome MV3 extension that connects the Zaviya worker to logged-in **X**, **Instagram**, and **Facebook** tabs via a local WebSocket bridge.

Built with [WXT](https://wxt.dev/) + TypeScript. Message shapes match `@zaviya/shared` (`BridgeJobSchema`, `BridgeMessageSchema`).

## Prerequisites

1. Worker running with bridge enabled:
   - Set `BRIDGE_TOKEN` in `apps/worker/.env` (see `.env.example`, default dev token `zaviya-dev-bridge`).
   - `pnpm --filter @zaviya/worker dev`
2. Log into x.com / instagram.com / facebook.com in Chrome (same profile as the extension).

## Load unpacked (development)

```bash
cd apps/extension
pnpm install   # from repo root: pnpm install
pnpm dev       # watch build → .output/chrome-mv3
```

In Chrome: **Extensions → Developer mode → Load unpacked** → select:

`apps/extension/.output/chrome-mv3`

Open **Extension options** and confirm:

| Setting | Default |
|--------|---------|
| Bridge URL | `ws://127.0.0.1:8787` |
| Bridge token | Same as worker `BRIDGE_TOKEN` |

## Production build

```bash
pnpm --filter @zaviya/extension build
# Load .output/chrome-mv3
```

## Protocol (extension → worker)

| Message | When |
|--------|------|
| `{ type: "hello", token, version }` | On WebSocket connect |
| `{ type: "heartbeat", tabs: { x?, instagram?, facebook? } }` | Every 15s when authenticated |
| `{ id, ok: true, result }` / `{ id, ok: false, error }` | Job completion |

## Protocol (worker → extension jobs)

| Job type | Handler |
|----------|---------|
| `x.readList` | Opens list URL, DOM-scrapes tweets → `result` is `XPost[]` |
| `x.post` | Fills composer, clicks Post → `{ externalId? }` |
| `instagram.post` | Best-effort UI automation (see gaps) |
| `gemini.image` | **Not implemented** — returns error `gemini.image_not_implemented` |

Inbound jobs are validated with `BridgeJobSchema`; outbound control/result messages with `BridgeMessageSchema`.

## Limitations

- **DOM scraping** depends on X/IG/FB markup; breaks when they change.
- **Checkpoints** (captcha, unusual activity) abort with `checkpoint_detected`.
- **Media**: X/IG posting does not reliably attach remote `mediaUrls` yet.
- **Facebook posting**: no `facebook.post` in `BridgeJobSchema`; Facebook appears in heartbeat only.
- **Delays**: options default 2–5s for local dev; architecture recommends 20–90s between actions in production.
- **Gemini web fallback**: stubbed TODO.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | WXT dev / watch |
| `pnpm build` | Production bundle |
| `pnpm typecheck` | `tsc` + protocol sample verification |
