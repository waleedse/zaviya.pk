# Daily headlines video — plan

Goal: a 30-second vertical video of the day's top headlines, made by a plain worker job (no agent, no LLM
in the loop), posted to every platform twice a day: a morning edition and an evening edition.

## What the viewer sees (30 s, 1080×1920, 9:16)

| Time | Scene |
|---|---|
| 0–3 s | Intro: Zaviya logo, "Friday, 16 October 2026 · 5 Jumada I 1448", edition label ("Morning headlines" / "Evening update"). Soft music fades in. |
| 3–24 s | 5 headlines × ~4 s. Each: the article's own photo with a slow Ken Burns zoom, category chip, headline typed/animated in (word-by-word rise), small "zaviya.pk/…" footer, thin progress bar of 5 segments. |
| 24–30 s | Outro: "Follow Zaviya" with Instagram, Facebook, X, YouTube, TikTok handles animating in, "Full stories at zaviya.pk". |

Headline text is burned in (most people watch muted), music is a calm news bed, transitions are crossfades.
No voice-over in v1 (avoids TTS quality and licence problems; can be added later with a local TTS model).

## How it works (all inside the existing worker)

1. **Pick** (`video/pick.ts`): query published articles of the last 14 h (morning) or 8 h (evening), take the
   ones the editor marked `priority: high`, then newest; apply `sameStory()` from `apps/web/src/lib/front-page.ts`
   so five headlines are five different events; require a hero image; max 1 per category except Pakistan (2).
2. **Script** (`video/compose.ts`): a pure function turns the 5 articles into a JSON "timeline"
   (scene, image URL, shortened headline ≤ 70 chars, category colour, duration). Headline shortening is
   rule-based (cut at a clause, never an LLM), so the job is deterministic and testable.
3. **Render** (`video/render.ts`): Remotion composition `DailyHeadlines` (React, same brand fonts and colours
   as the site; `brand-kit/` supplies logo and handles) rendered with `@remotion/renderer` using the Chromium that
   the worker image already ships for post cards, plus ffmpeg. Output H.264 + AAC MP4, ≤ 10 MB, 30 fps.
   Expected render time on the Contabo VPS: 1–3 minutes. Concurrency 1, its own BullMQ queue `video`
   so it can never slow the news pipeline.
4. **Store**: upload to R2 (same helper as social cards) → public URL; create a `social-posts` row per
   platform (format `reel`, already in the collection) so it shows in the admin social panel with failures visible.
5. **Post** per platform (below). Each uploader records posted/failed + reason, like `postX` now does.
6. **Schedule**: BullMQ repeatable jobs, Karachi time: 07:30 (morning edition) and 19:30 (evening; optional
   second at 13:30). Jobs are idempotent per `edition-date`, so a restart never double-posts.
7. **Website**: the same MP4 is embedded on the homepage "Today in 30 seconds" slot and gets a `VideoObject`
   JSON-LD block (helps Google video results).

## Platforms

| Platform | Method | Notes |
|---|---|---|
| Instagram Reels | Graph API: `POST /{ig-user}/media` (`media_type=REELS`, `video_url`) then `/media_publish` | Same Meta token already used for posts (needs `instagram_content_publish`). Public MP4 URL from R2. |
| Facebook Reels | Graph API `/{page}/video_reels` (start → upload → finish) | Same page token. |
| YouTube Shorts | Data API v3 `videos.insert`, vertical ≤ 60 s is auto-Short | One-time OAuth consent; 1,600 quota units per upload (10,000/day free). Add `#Shorts` to title. |
| X | v2 chunked media upload (INIT/APPEND/FINALIZE, `amplify_video`) then tweet | Needs working X API keys (see "X posting" below); the upload endpoint is the same OAuth 1.0a. |
| TikTok | Content Posting API (Direct Post) | Until the TikTok app passes audit, posts land as private/draft: v1 uploads as draft and you tap publish; apply for the audit in parallel. |
| WhatsApp channel / Telegram | Telegram bot `sendVideo` is trivial and free; WhatsApp channels have no API, so share the MP4 manually or by the existing WhatsApp CTA | Telegram first. |

Caption (rule-based, no LLM): date line, the 5 headlines as a numbered list, `zaviya.pk` link with
`utm_source=<platform>&utm_medium=video`, 5 fixed hashtags (#Pakistan #PakistanNews #Zaviya + 2 by lead category).
Because of the utm tag, the new "Today by source" admin panel shows how many visits each video brings.

## Build order

1. Remotion composition + `compose.ts` with fixtures; render locally to MP4 and review the look (half a day).
2. Pick + render job + R2 upload + admin "Videos" list; run manually from the control room (`zaviya_commands`).
3. Instagram + Facebook + Telegram posting (reuse Meta token).
4. YouTube OAuth + upload, then X video, then TikTok draft.
5. Schedules on, and metrics: views per platform pulled back into `social-posts.metrics`.

## Risks / decisions for you

- **Licences**: music must be royalty-free (YouTube Audio Library or CC0 tracks, kept in `brand-kit/audio/`). Photos are
  the articles' own AI-generated heroes, so there is no stock-photo issue.
- **Server load**: rendering uses ~1 CPU core for a couple of minutes; run it outside the 5-minute peak news hours.
- **Zero-downtime rule**: ship as a separate queue/worker code path behind a `VIDEO_ENABLED` env flag, tagged release with rollback.
- **Urdu edition**: the composition takes a `locale`; Urdu headlines need the Noto Nastaliq font (already used for post cards).

## X posting (found today)

The worker log shows every X post going through the Chrome-extension bridge and timing out ("bridge job timeout");
nothing was recorded, so the admin showed no failure. The server has X env vars but the API path was never used
(either blank or the API call is not reached), so posts depend on Waleed's Mac extension being online. Fixed today:
every X attempt now writes a `failed` social post with the reason (API status and message, or "extension not connected").
Next step is yours: confirm the four X API keys (consumer key/secret, access token/secret, with read+write permission)
and that the X developer account has posting credits; then X posts go out by API without the Mac.
