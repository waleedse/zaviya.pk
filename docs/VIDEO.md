# Daily headlines video — plan (v2)

Goal: fully animated vertical news videos (15–60 s), made by a plain worker job (no agent and no LLM in the loop)
and posted to every platform several times a day. The same engine makes every format.

## Formats and daily schedule (PKT)

Story volume measured on 17 Oct 2026: about 45 stories per 12 h (pakistan 34/day, business 19/day, world 8/day),
but **only about 4 AI + tech stories a day**. That's why the AI & Tech video runs 3× a week, not daily.

| Slot | Format | Content | Days |
|---|---|---|---|
| 08:00 | `headlines30`: 30 s, 6 stories | "N stories to know today" | daily |
| 13:00 | `money45`: 45 s | Dollar, gold and petrol first, then up to 6 business stories | Mon–Sat |
| 17:30 | `topic60`: 60 s, 5–8 stories with a one-line explainer each | "AI & Tech this week" (96 h window) | Tue, Thu, Sat |
| 20:00 | `roundup60`: 60 s, up to 12 stories | 8 full stories + Numbers + "More headlines" quick hits (4 more) | daily |
| when it happens | `flash15`: 15 s, 1 story | Breaking (`isBreaking`) | at most 2/day, at least 3 h apart, never within 45 min of a scheduled video |

That makes **2–4 scheduled videos a day plus up to 2 breaking flashes**, a healthy rhythm. Posting more often generally
increases reach as long as quality holds, but the same audience getting 8 near-identical videos a day starts skipping them,
and skips hurt reach.

Limits that cap the count:

- **YouTube**: about 1,600 quota units per upload against 10,000/day, so at most about 5 Shorts a day. Flashes skip YouTube when the quota is low.
- **Instagram**: 50 API posts per 24 h, no problem.

**Rollout**: weeks 1–2 run only 08:00 + 20:00 to get a baseline. Add `money45` in week 3 and `topic60` in week 4, then
keep the formats whose average watch time and follows per view are best.

**"More news"**: a 30 s video fits 6 stories at about 3.5 s each. Shorter scenes can't be read, and viewers swipe away.
The 60 s roundup fits 12 by using a quick-hits scene for stories 9–12. Beyond about 12 stories, retention drops faster
than the extra headlines add, so 12 is the cap.

## What changed from v1, and why

| v1 | v2 | Why |
|---|---|---|
| 3 s logo intro | 1.5 s hook that starts on the lead story's moving photo, with the date slamming in | Reels, Shorts and TikTok decide in the first 1–2 s whether to keep showing a video. A logo intro loses viewers. |
| 5 equal 4 s slides with a crossfade | Scenes get time based on headline length, cut on the music's beat, with brand-yellow wipes, kinetic text, highlight swipes and count-up numbers | Motion on every beat is what makes it feel "animated" rather than a slideshow. |
| Headline only | Number badge, category chip, headline with highlighted key word, Urdu subline, source credit ("via Dawn · Reuters"), count-up figure when the story has one | Reuses the card data the pipeline already makes (`highlight`, `figure`, `headlineUr`), gives credibility, and gives more to look at. |
| — | "Numbers today" scene: dollar, gold and petrol from the worker's existing `data/rates.ts` | A Pakistan-specific reason to watch every day. |
| "Follow us" outro | Outro asks "Which story matters most to you? Comment 1–5", then the handles pop in on the beat; the last frame matches the first so the video loops | Comments and replays are the strongest ranking signals. Numbered stories make commenting easy. |
| One look | Morning "Sunrise" theme (cream and yellow) and evening "Night desk" theme (navy and yellow); a red "Breaking" opener; a calm "sombre" mode | Stops it looking the same every day, and keeps it from feeling upbeat over tragic news. |
| Fully automatic | A Telegram preview with Approve / Skip buttons. It posts by itself after 10 minutes if nobody taps | A wrong photo on a death story would be costly. This adds no work: ignore it and it still posts. |
| Uploads to R2 | Saved to Payload media (the worker has no R2; post cards already go through `payload.uploadMedia`) | Matches the real code. |
| Render inside the worker | Render in a separate `video` container that runs the same image with its own CPU and memory limits | A render that runs out of memory can never take down the news pipeline (zero-downtime rule). |

## The 30 seconds (1080×1920, 30 fps, H.264 + AAC, about −14 LUFS)

The timings below assume a 120 BPM track (one beat = 0.5 s = 15 frames). Every cut lands on a beat.

| Time | Scene | Motion |
|---|---|---|
| 0.0–1.5 s | **Hook** | The lead story's photo is already panning. Big two-line kinetic text "5 STORIES / PAKISTAN NEEDS TODAY" (evening: "TODAY IN 30 SECONDS") springs up word by word. A date stamp "SAT 17 OCT · 6 JUMADA I" slams in with a tick sound. The small Zaviya logo sits in the corner for the whole video. |
| 1.5–7.0 s | **Story 1 (lead, longer)** | See the story scene layout below. |
| 7.0–19.0 s | **Stories 2–4** | 3.5–4.5 s each, depending on headline length (about 3 words a second plus 1 s, rounded to beats). |
| 19.0–22.5 s | **Numbers today** | Three tiles count up: USD/PKR, gold (per tola), petrol. Green or red arrows show the change since yesterday. Each value carries a small source label, as `rates.ts` already requires. Skipped automatically if the rates are stale. |
| 22.5–26.5 s | **Story 5** | |
| 26.5–30.0 s | **Outro** | "Which story matters most? Comment 1–5" with five numbered chips. Then the Instagram, Facebook, YouTube, TikTok and X icons and "@zaviyapk" pop in on the beat, then "Full stories → zaviya.pk". It ends on the hook's colour so the loop is seamless. |

**Story scene layout** (each one):

1. **Transition in**: a diagonal brand-yellow wipe over 6 frames, with a soft whoosh.
2. **Background**: the hero images are 16:9 (1600×900), so the scene shows a full-height 9:16 crop that pans slowly across the wide photo while zooming from 1.06 to 1.14. A blurred copy fills any gaps. A dark gradient covers the bottom 45% so the text stays readable.
3. **Top**: a story-style progress bar in five segments, which fill as the video plays.
4. **Badge**: "1/5" pops in with a spring. The category chip, in its colour from `CATEGORIES`, slides in from the left.
5. **Headline**: Inter 800, sized by `fitText` so it never overflows. The words rise one after another, two frames apart. At about 60% of the scene, a yellow marker swipes behind the `highlight` word.
6. **Urdu subline**: `headlineUr` in Noto Nastaliq fades in under the headline.
7. **Figure**: when the story has a `figure`, a large count-up number appears, for example "Rs 23,500 ↑".
8. **Credit**: "via Dawn · Reuters", taken from the article's top two tier-1/2 `sources`.

**Modes** are chosen by rules, not by AI:

- **Breaking**: if an `isBreaking` story is in the window, it leads, with a red "BREAKING" opener and a ticker sound.
- **Sombre**: if the lead headline matches a keyword list (killed, martyred, blast, attack, earthquake, flood, crash, dies…), the video uses slower fades instead of wipes, no whoosh, the calm track and no bouncy springs.
- **Short day**: with only 3–4 good stories, the scenes stretch. With fewer than 3, it skips the edition and sends a Telegram message.

**Audio**:

- **Our own music** (decided 17 Oct 2026): tracks synthesized by `packages/video/scripts/make-audio.ts`, so there are no licences and no Content ID claims. There are 2 bright tracks for the morning, 2 for the evening and 1 calm track for sombre mode. They rotate by date. Each track's BPM and first-beat offset are stored in `tracks.json` so cuts land on beats.
- CC0 sound effects (whoosh, tick, pop) at low volume.
- The mix is loudness-normalised by ffmpeg.
- Text is burned in, because most people watch muted.
- No voice-over in v2. A TTS voice in Urdu or English can be added later as a flag on the same timeline.

## How it works (no agent, all deterministic)

New package **`packages/video`**: Remotion compositions in React, plus pure functions. Both the worker (to render)
and the web app (`@remotion/player` for the admin preview and the site) use it. Fonts (Inter, Unbounded, Noto Nastaliq)
are bundled as woff2 files, so a render never depends on Google Fonts being reachable.

1. **Pick** (`pick.ts`):
   - Take articles published in the last 14 h (morning) or 10 h (evening).
   - Order them: breaking first, then `priority: high`, then the highest `ai.qaScore`, then newest.
   - Use `sameStory()` from `apps/web/src/lib/front-page.ts`, so that five headlines are five different events.
   - Allow at most 1 story per category, except Pakistan (2).
   - Require a hero image.
   - Don't repeat a story from the previous edition, unless it has a new `updates[]` entry.
2. **Compose** (`compose.ts`, pure and unit-tested): articles + rates + edition + theme give a `Timeline` JSON. It sets:
   - scene durations on beats
   - shortened headlines (rule-based: cut at a clause, at most 70 characters)
   - the highlight word, figure and sources
   - the mode, track and Hijri date (`Intl` with `islamic-umalqura`)
   - an experiment variant (see Metrics)
3. **Prefetch**: download the five hero images to a temp folder and check that each one decodes. If one fails, use a category-colour gradient with a pattern instead.
4. **Render** (`render.ts`):
   - `@remotion/renderer` `renderMedia()` on a bundle built at **Docker build time** (no bundling at runtime).
   - Uses Remotion's chrome-headless-shell, installed in the Dockerfile.
   - Concurrency 2, so a 900-frame render takes about 2–3 min on the Contabo 4 vCPU.
   - Also `renderStill()` of a cover frame ("TODAY · 17 OCT · 5 STORIES" over the lead photo).
5. **QA gate** (rule-based, with ffprobe). Checks:
   - duration 28–32 s
   - 1080×1920, yuv420p
   - AAC 48 kHz
   - size under 40 MB
   - audio present
   - no missing images left

   On any failure: no posting, a Telegram alert and a `failed` row with the reason.
6. **Store**: new `videos` collection holding the MP4, the cover, edition, date, the timeline JSON, the status
   (`rendered → approved → posting → posted / failed / skipped`) and per-platform results. The Media upload is
   extended to accept `video/mp4`. Files older than 30 days are deleted, which keeps total storage under 1 GB.
7. **Approve**: the Telegram bot (`telegram/bot.ts`, grammy) sends the MP4 plus the caption with **Approve / Skip / Re-render** buttons. With no answer after 10 min, it posts. `VIDEO_APPROVAL=auto|veto|required` (start with `veto`).
8. **Post**: one BullMQ job per platform. Each job has retries with backoff and an idempotency key `video:{date}:{edition}:{platform}`, and writes a `social-posts` row (format `reel`) with posted/failed + the reason, like X does now.
9. **Schedule**: BullMQ job schedulers with a `pattern` and `tz: 'Asia/Karachi'`. Rendering starts at 07:40 and 19:40, so the video posts at 08:00 and 20:00. A restart never double-renders or double-posts, because the jobs are keyed by edition and date.
10. **Website**:
    - a watch page per edition, `/video/2026-10-17-morning`, with the video as the main content, a `VideoObject` JSON-LD block and the five linked headlines
    - a video sitemap
    - a homepage slot "Today in 30 seconds" (poster + `<video>`)

    Google indexes video only from pages where the video is the main thing, which is why each edition gets its own page.

**Deployment**: a `video` service in `docker-compose.server.yml` using the worker image with `WORKER_ROLE=video`
(it consumes only the `video` and `video-post` queues). Limits: `cpus: 2`, `mem_limit: 3g`. Everything is behind
`VIDEO_ENABLED` and ships as a tagged release. Rollback means flag off or stopping that one container; the news worker is untouched.

## Platforms

| Platform | API | Caption | Status / blocker |
|---|---|---|---|
| **Instagram Reels** | `POST /{ig-user}/media` with `media_type=REELS`, `video_url`, `cover_url`, `share_to_feed=true`, then `/media_publish`. A first comment with the links goes through `/{media}/comments` | 2,200 chars; 5 hashtags | Ready: same Meta token (`instagram_content_publish`). |
| **Facebook Reels** | `/{page}/video_reels` start → upload with `file_url` → finish with `video_state=PUBLISHED` | Same as IG + direct link | Ready: same Page token. |
| **YouTube Shorts** | Data API `videos.insert` (vertical and ≤ 60 s makes it a Short), `thumbnails.set` | Title ≤ 100 chars with `#Shorts`; description has the 5 headlines + linked chapters | Needs a one-time OAuth refresh token. **Uploads from unaudited API projects are locked to private**: apply for the YouTube API compliance audit on day 1. Until it passes, the job uploads as private and the Telegram message says "make public in Studio" (one tap). |
| **TikTok** | Content Posting API: `video.upload` (lands in the TikTok inbox as a draft) now, `video.publish` (direct post) after the audit | 2,200 chars | Apply for the app audit on day 1. Until then: draft, then one tap in the app. |
| **X** | v2 chunked media upload (INIT/APPEND/FINALIZE, category `amplify_video`), then a post | ≤ 280: "Today in 30 seconds · 17 Oct" + link | Needs the four X API keys with write access, and API credits (see below). |
| **Threads** | Graph `media_type=VIDEO` → publish | ≤ 500 | Optional: add the `threads_content_publish` scope to the Meta app. |
| **Telegram channel** | Bot `sendVideo` | Full caption | Ready: costs nothing. |
| **WhatsApp channel** | No API exists | — | The bot sends the MP4 + caption to your DM, ready to forward with one tap. |

**Captions** are rule-based (`packages/video/src/captions.ts`):

- a hook line
- the date
- every headline, numbered to match the video
- "Comment the number you want explained 👇"
- the `zaviya.pk` link with `utm_source=<platform>&utm_medium=video&utm_campaign=<format>-<date>`

**Hashtags: few and exact beat many.** Instagram has allowed only **5 hashtags per post or Reel** since 18 Dec 2025, counting the caption and comments together.
YouTube ignores *all* hashtags if there are more than 15, and shows the first 3 above the title. So the generator picks the best few per platform:

| Platform | Hashtags |
|---|---|
| Instagram | 5 |
| TikTok | 5 |
| Facebook | 3 |
| YouTube | 3 + `#Shorts` in the title |
| X | 2 |
| Threads | 1 |

They are chosen in this order:

1. The format's core tag (`#PakistanNews`, `#AI`, `#PakistanEconomy`).
2. Terms trending in Pakistan on Google Trends (the worker already ingests them) that appear in a story.
3. The lead stories' own article tags in CamelCase (`State Bank of Pakistan` → `#StateBankOfPakistan`). These are specific, so they reach people searching for that topic.
4. The category tag (`#Cricket`, `#Business`…).
5. `#Zaviya`, always last.

The words in the caption and the text burned into the video also count for search on Instagram, TikTok and YouTube, which is why every headline is in the caption.

## Metrics and getting better without an agent

- **Collection**: 24 h and 72 h after posting, a job pulls the numbers into `social-posts.metrics`:
  - IG: plays, reach, `ig_reels_avg_watch_time`, saves, comments
  - FB: video insights
  - YouTube: views and likes (Data API), plus retention later through the Analytics API
  - TikTok: `video.list`
  - X: public metrics
  - site: visits through the utm tags in the "Today by source" panel
- **Variants**: each edition gets a variant chosen by date, so it can be reproduced. Options: 4 vs 5 stories, Numbers scene on or off, hook wording A or B, track. After 2–3 weeks, the admin **Videos** page shows average watch time and plays per variant. You pick the winners by flipping the defaults in settings.

## Build order

0. **Day 0 (you)**:
   - buy or pick the music licences
   - apply for the YouTube API audit and the TikTok app audit
   - add the Threads scope
   - confirm the X keys
   - confirm the Remotion licence: it's free for companies of up to 3 people; beyond that it needs a paid company licence
1. **Look (2–3 days)**:
   - `packages/video` with both themes, every scene and mode, fixtures from yesterday's real articles
   - preview in Remotion Studio
   - render 3 sample MP4s (normal, breaking, sombre) for you to review before anything is wired up
2. **Pipeline (2 days)**:
   - pick and compose with tests
   - the `video` container and queue, render, QA gate
   - the `videos` collection with an admin list and a player
   - the Telegram preview with approve
   - a manual "render now" button in the control room
3. **First platforms (1 day)**: IG Reels, FB Reels, Telegram, the website watch page and homepage slot. Schedules on.
4. **Remaining platforms (as approvals arrive)**: YouTube, X, TikTok, Threads.
5. **Learning (1 day)**: metrics pull, variant report, Urdu-only edition if the numbers say Urdu wins.

## Decisions for you

1. **Second slot**: evening 20:00 (recommended, peak time in Pakistan), afternoon 13:00, or both.
2. **Language**: English headline with an Urdu subline in one video (recommended to start), or a separate Urdu edition for FB, TikTok and WhatsApp (doubles the render time, still cheap).
3. **Approval**: 10-minute veto on Telegram for the first 2 weeks (recommended), then fully automatic.
4. **Music**: decided: our own synthesized tracks, with no licence and no claims.

## X posting (open item)

Every X attempt now records a `failed` social post with the reason. To post by API without the Mac extension, confirm
the four X API keys (consumer key/secret, access token/secret, read+write) and that the developer account has credits.
The video upload uses the same OAuth 1.0a.
