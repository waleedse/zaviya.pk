# @zaviya/video

Remotion package for the daily 30-second headlines video (phase 1: look and sample renders). See `docs/VIDEO.md` and `docs/VIDEO-BUILD.md`.

```
pnpm --filter @zaviya/video fixtures   # build fixtures/*.json from zaviya.pk public API + download hero images
pnpm --filter @zaviya/video audio      # synthesize placeholder music + SFX into public/audio
pnpm --filter @zaviya/video studio     # open Remotion Studio (needs fixtures + audio first)
pnpm --filter @zaviya/video samples    # render out/<name>.mp4, covers and contact sheets (args: names, --sheets-only; env FRAMES, SHEET_SCALE)
pnpm --filter @zaviya/video qa         # ffprobe checks, writes out/qa.json
pnpm --filter @zaviya/video test       # vitest (compose, text, hijri)
```

`compose()` is pure and deterministic: articles + rates + edition give a `Timeline` of exactly 900 frames at 30 fps. All `@remotion/*` packages are pinned to the same exact version; keep them identical when upgrading.

## Worker / production

- `src/select.ts` (`selectEdition`) turns live API data into an `EditionInput`; `src/render.ts` (`@zaviya/video/render`) renders from a prebuilt bundle and runs QA (`src/qa.ts`).
- `pnpm bundle` builds `build/bundle` (done at docker build time by `infra/video.Dockerfile`).
- `pnpm audio` synthesizes our own music (5 beds, -16 LUFS, peaks -3 dBFS) and writes 10 s previews to `out/audio-previews/`.
- The service lives in `apps/worker/src/video/` (see `infra/video.Dockerfile`, `VIDEO_*` env vars).
