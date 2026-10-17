# Daily video — build brief, phase 2: a separate video worker on the server

**Goal**: by 07:40 PKT on 17 Oct 2026, a separate `video` container on the production server renders the morning
video from live news, sends a Telegram preview, and at 08:00 posts it as an Instagram Reel and a Facebook Reel.
The 20:00 evening roundup follows the same way.

The existing news worker must keep running untouched: the video work must never slow it down or crash it.

## Hard rules

- **Branch**: work on branch `feat/daily-video`. Do **not** commit, push, tag, deploy or ssh. The reviewer does the release.
- **Allowed files**: you may edit `packages/video/**`, `apps/worker/**`, `infra/video.Dockerfile` (new), `infra/docker-compose.server.yml`,
  `infra/scripts/deploy.sh` and `.dockerignore` if needed. Don't touch `apps/web`, the database or nginx.
- **Main worker**: it changes in exactly one place, the Telegram skip button (below). Its startup, queues and image stay the same.
- **No AI**: no LLM calls. Deterministic.
- **Never post anything** while you build or test. Every local run uses `VIDEO_PLATFORMS=` (empty), which means dry run.
- **Already written** by the reviewer (use them, don't rewrite them): `apps/worker/src/social/reels.ts` (IG + FB Reels via resumable
  upload of a local file, no public URL needed) and `apps/worker/scripts/post-reel.ts`.

## Facts (verified)

- **Server**:
  - Contabo 4 vCPU / 8 GB, about 5 GB free memory.
  - Compose project `zaviya` from `infra/docker-compose.server.yml` (postgres, redis, worker, agents).
  - Web runs blue/green in separate projects but joins network `zaviya_default` with alias `web`, so `http://web:3000` works from any service in the main stack.
  - Deploy is `infra/scripts/deploy.sh <tag>`. It builds the images, switches web, then `stack ... up -d ... worker agents`, then prunes old images per repo.
- **Env**: `worker.env` (used as `env_file`) already has `META_PAGE_TOKEN`, `META_PAGE_ID`, `IG_USER_ID`,
  `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_CHAT_ID`. Reuse that env file for the video service.
- **Telegram**: the main worker long-polls Telegram with grammy (`apps/worker/src/telegram/bot.ts`).
  **A second poller would break it** (Telegram returns 409 Conflict). So the video service must only *send*, using plain Bot API HTTP calls (`sendVideo`, `sendMessage`), and **never** call `getUpdates` or start a grammy bot.
- **Data**: the public API is `http://web:3000/api/articles?...&locale=en` and `/api/data-points` (same as the fixture
  script used through https://zaviya.pk). Hero image URLs are absolute. Download them to a temp dir.
- **Redis**: `redis://redis:6379`. BullMQ 5/6 is already a worker dependency.

## What to build

### 1. `packages/video`: library entry points for the worker

- `src/select.ts`: live-data selection, moved out of the fixture script so both the script and the worker use it. Inputs: articles + rates + format + slot time. Output: `EditionInput`.
- `src/render.ts` (Node only, export it as `@zaviya/video/render`):
  - `renderEdition({ timeline, outDir, bundleDir, concurrency }) → { mp4, cover, durationMs }`
  - It uses a **prebuilt** bundle directory (no bundling at runtime).
  - It sets `pixelFormat: 'yuv420p'`, which fixes the yuvj420p issue properly; use JPEG frames if this passes QA, because it is faster than PNG.
  - It runs QA (the same checks as `scripts/qa.ts`) and throws a `QaError` listing the failed checks.
- `scripts/bundle.ts`: bundles the composition into `build/bundle` (used at docker build time).
- Audio: run `make-audio` at docker build time, since the WAVs are gitignored.

### 2. `apps/worker/src/video/`: the video service (its own entry point)

| File | Purpose |
|---|---|
| `main.ts` | **Separate process entry.** Loads the config; if `VIDEO_ENABLED !== 'true'`, logs and idles without exiting. Creates the BullMQ `video` queue + Worker (concurrency 1, lockDuration 15 min), upserts the schedulers, and handles SIGTERM. No bridge, no grammy, no other queues. |
| `schedule.ts` | Parses `VIDEO_SLOTS` (default `morning@07:40=headlines30,evening@19:40=roundup60`). Each slot is upserted with `{ pattern: 'M H * * *', tz: 'Asia/Karachi' }` under the scheduler id `video-<slot>`. Remove scheduler ids that are no longer configured. Post time = render time + `VIDEO_VETO_MIN` (default 20). |
| `job.ts` | One edition run (see below). |
| `telegram.ts` | `sendPreview(mp4, caption, key)` with the Bot API `sendVideo` (multipart; the file is about 10 MB, under the 50 MB limit), plus an inline keyboard button **"Skip this video"** with callback_data `videoskip:<key>`. `notify(text)` sends via `sendMessage`. |
| `job.test.ts`, `schedule.test.ts` | Slot parsing, idempotency and skip logic, with Redis/Graph/Payload mocked. |

`job.ts` runs one edition in this order:

1. Compute the key `YYYY-MM-DD-<slot>` (Karachi date). If Redis `video:done:<key>` exists, stop (idempotent across restarts).
2. Fetch articles and rates, then `select`. On `NotEnoughStories`: send a Telegram notify and stop.
3. Download the images (if one fails, use the category gradient), compose, render, QA. On any failure: send a Telegram notify with the reason, write a `failed` social post for each platform with the error, and stop.
4. `buildCaptions` for every platform. Save the MP4, cover and captions JSON in `/data/videos/<key>/`.
5. Send the Telegram preview: video + "Posting at HH:MM to Instagram + Facebook. Tap Skip to cancel."
6. Wait until the post time (a `job.moveToDelayed` / delayed child job or a simple sleep; keep the lock alive), then check Redis `video:skip:<key>`. If it is set: notify "Skipped" and record `skipped`.
7. For each platform in `VIDEO_PLATFORMS` (default `instagram,facebook`):
   - claim it with Redis `SET video:posted:<key>:<platform> 1 NX EX 172800`, so it can never post twice
   - post with `reels.ts`
   - write a social post (`format: 'reel'`, `article` = the lead story id, idempotencyKey `sha1('video:<key>:<platform>')`, the same as `post-reel.ts`)
8. Notify the result (posted ids or errors). Set `video:done:<key>`.
9. Delete `/data/videos/*` folders older than 14 days.

The CLI is `node --import tsx src/video/cli.ts run <slot> [--now] [--dry]`:

- runs one edition immediately
- `--now` posts with no wait
- `--dry` renders and previews but never posts

### 3. The one change in the main worker: the skip button

In `telegram/bot.ts` `callback_query:data`, handle `videoskip:<key>`:

- set Redis `video:skip:<key>` with a 6 h TTL
- answer "Video skipped"

Pass a small `skipVideo(key)` dependency from `index.ts`, using the runtime's Redis connection. Add a unit test if the bot has tests; otherwise keep the change minimal. Nothing else in the main worker changes.

### 4. Image and compose

**`infra/video.Dockerfile`**:

- `node:22-bookworm-slim` + corepack pnpm 10.18.0.
- The **Remotion chrome-headless-shell Linux dependencies**: libnss3, libdbus-1-3, libatk1.0-0, libatk-bridge2.0-0, libgbm1, libasound2, libxrandr2, libxkbcommon0, libxfixes3, libxcomposite1, libxdamage1, libpango-1.0-0, libcairo2, libcups2, fonts-noto-core, ca-certificates. Check Remotion's current docs list for 4.0.536.
- `pnpm install --frozen-lockfile --filter @zaviya/worker... --filter @zaviya/video...`, then `npx remotion browser ensure` (from packages/video), then `pnpm --filter @zaviya/video audio`, then `pnpm --filter @zaviya/video bundle`.
- `WORKDIR /app/apps/worker`, `CMD ["node","--import","tsx","src/video/main.ts"]`.
- Keep the image as small as is reasonable. Don't install claude or cursor (the main worker image does; this one must not).

**`docker-compose.server.yml`**: a new service `video`:

```yaml
image: zaviya-video:${RELEASE:-latest}
build: { context: .., dockerfile: infra/video.Dockerfile }
restart: unless-stopped
env_file: ${ENV_DIR:-../../env}/worker.env
environment: { PAYLOAD_URL: http://web:3000, REDIS_URL: redis://redis:6379, NODE_ENV: production, VIDEO_ENABLED: ${VIDEO_ENABLED:-false} }
volumes: [videodata:/data/videos]
cpus: 2
mem_limit: 3g
depends_on: { redis: { condition: service_healthy } }
```

Also add the `videodata` volume.

**`deploy.sh`**:

- build `worker agents video`
- `up -d ... worker agents video`
- add `zaviya-video` to the image-prune loop

`VIDEO_ENABLED` comes from `compose.env` and defaults to false, so a deploy alone changes nothing until it is switched on. **Rollback** is `VIDEO_ENABLED=false` or `docker stop zaviya-video-1`.

### 4b. Our own music (owner's decision: no bought or library tracks)

Upgrade `scripts/make-audio.ts` so the synthesized tracks sound like a real news bed. The tracks are still made only from our own
code, deterministic and dependency-free:

- **5 tracks** in `tracks.json`: `bright-a` and `bright-b` (120 BPM), `night-a` and `night-b` (110 BPM), `calm` (80 BPM).
- **Sound**:
  - a layered pad (detuned saws with a simple one-pole low-pass)
  - a plucked arpeggio/melody on 8th notes
  - a sub bass on the root
  - a soft kick on beats 1 and 3, a clap on 2 and 4, and hats
  - a gentle reverb made of a few feedback delays
  - a riser before bar 1
- Length: 65 s, so the 60 s formats are covered.
- Peaks normalised to −3 dBFS. In the composition, music sits at about −16 LUFS under the SFX.
- Render one 10 s preview MP3/WAV of each track to `out/audio-previews/` and report them.

### 5. Local verification (mandatory, on this Mac; Docker is available)

1. `pnpm --filter @zaviya/video test && typecheck`, and `pnpm --filter @zaviya/worker test && typecheck`. Everything passes.
2. Build the video image locally:

   ```
   docker build -f infra/video.Dockerfile -t zaviya-video:local .
   ```

3. Run one dry edition in it against the live public API, with a local throwaway Redis:

   ```
   docker run --rm -e PAYLOAD_URL=https://zaviya.pk -e REDIS_URL=redis://host.docker.internal:6380 -e VIDEO_PLATFORMS= ... zaviya-video:local node --import tsx src/video/cli.ts run morning --now --dry
   ```

   - The local compose Redis is on 127.0.0.1:6380. If it isn't running, start a throwaway `redis:8-alpine` on another port.
   - **No Telegram env** locally, so the preview is skipped with a log line.
   - It must produce a QA-passing MP4 in a mounted output dir. Report its render time **inside the container**.
4. Read the result's contact frames (render 4 stills or extract them with the bundled ffmpeg) to confirm that fonts (Inter, Nastaliq) and images render inside Linux exactly like on the Mac.

## Final report

Include:

- the files changed
- the test results
- the image size
- the in-container render time
- confirmation that the dry run produced a QA-passing video (and its path)
- the exact env vars to set on the server (`VIDEO_ENABLED=true` in compose.env; optional `VIDEO_SLOTS`, `VIDEO_PLATFORMS`, `VIDEO_VETO_MIN`)
- anything you could not verify
- confirmation that nothing was committed or posted
