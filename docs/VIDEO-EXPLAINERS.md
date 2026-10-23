# Urdu explainer videos — plan (v1, 24 Oct 2026)

**Goal**: one Urdu-voiced explainer video (45–60 s, 1080×1920) every 3 hours' round, chosen from everything trending in
Pakistan and the world ("how the PHP bug affects ordinary people", "how petrol price is set"). Real photos where we
may use them, honest AI illustrations and animated diagrams where we may not, an Urdu female voice, Urdu captions.
It extends the existing video service (`apps/worker/src/video`, `packages/video`); nothing in the news worker changes.

Decided with Waleed: voice = `AhsanTalal/urdu-matcha-tts-female` at length-scale 0.9 (the "fast" sample); local model,
no per-minute cost; the editor recommends topics and can veto; a ranked backlog so good leftovers get picked next round;
no greeting ("salam") at the start of the narration.

## 1. The 3-hour round

```
 ┌ discover ┐   ┌ score ┐   ┌ editor ┐   ┌ pick ┐   ┌ research ┐   ┌ script ┐   ┌ voice ┐   ┌ visuals ┐   ┌ render+QA ┐   ┌ veto ┐   ┌ post ┐
```

Rounds run at 06:00, 09:00, 12:00, 15:00, 18:00, 21:00 PKT (BullMQ scheduler, `tz: Asia/Karachi`, keyed by date+round so a
restart never double-makes). A round that finds nothing good makes nothing: an empty slot beats a weak video.
Posting happens 60–90 min after the round starts, never within 45 min of a scheduled Reel or a flash (the same
`slotBufferMs` rule `flash.ts` uses). Overnight rounds (00:00–05:59) only refresh the backlog; nothing posts.

1. **Discover** (every round): Google Trends PK and X trends (already in `trend.ts`), our own articles of the last 48 h
   (priority high first), tech/science/security feeds (CVE/security advisories, NASA/ESA, big-tech blogs, Hacker News,
   Reuters/Bloomberg tech and business pages the editor already tracks), plus topics the editor adds by hand.
2. **Score** each idea 0–100: Pakistan relevance and "what it means for you" (30), hook strength / timeliness (20),
   source strength: at least one primary source and two independent ones (20), visual availability (10), novelty versus the
   last 14 days of videos (10), explainability in 60 s (10). Hard filters first: sensitive list (violence, deaths, court
   cases, accusations of named people, religion/sect, elections) goes to `needs-veto`; unverifiable single-blog claims are dropped.
3. **Backlog**: every idea is stored with score, hook expiry (when it stops being news), sources, risk note, status
   (`backlog → picked → made → posted`, or `vetoed / expired`). Each round re-scores the backlog; ideas past their hook
   expiry leave; evergreen ideas (how petrol price is set, how to check FPSC eligibility) stay and fill quiet rounds.
4. **Editor**: the hourly editor run reviews the top 10 of the backlog and sets `boost`, `ok`, or `veto` with a one-line
   note (new item in `.claude/agents/editor.md`, through a `video-ideas` endpoint next to pitches and the gate).
   The round picks the highest score that is not vetoed; if the editor said nothing, it picks by score but only a
   `low`-risk idea. `needs-veto` ideas are made only after an explicit editor/Waleed approve.
5. **Research**: fetch the 2–4 sources (reader tab/readability, as the writer does), extract a fact sheet: numbered
   facts, each with its source URL and date. The script may use only these facts.
6. **Script** (LLM, `@zaviya/llm`): spoken Urdu in Urdu script, 120–140 words (≈55–60 s at our voice), structure:
   hook (3 s, a question or a surprising fact), 4–6 beats of "what happened / how it works", "aap par kya asar",
   a one-line call to see more at zaviya.pk. Each beat also carries a visual brief (`photo | illustration | diagram | number`)
   and 2–4 words of on-screen text. Rules for the narration: no digits (numbers, years, percentages and money written as
   Urdu words), English terms spelled in Urdu letters (PHP → پی ایچ پی), short sentences ending in «۔»; no greeting.
   Guards run on the result: the existing number guard against the fact sheet, banned-phrase list, length check.
7. **Voice**: a `tts` service (Python, onnxruntime + Vocos) that takes the script and returns audio sentence by sentence
   (the model is single-speaker and works best on one sentence), with 0.28 s gaps. Unknown characters are mapped to
   spaces by the model, so a sanitizer normalises text first. Per-sentence durations give caption timing; words inside a
   sentence are timed proportionally to their length.
8. **Visuals**: per beat, in this order: (a) a free real photo of the named subject (`real-photo.ts`, Wikimedia Commons;
   later NASA Image Library and other public-domain sources); (b) an explanatory illustration, generated and always
   labelled "AI illustration" on screen; (c) an animated diagram built in Remotion (flow arrows, counters, maps) for
   abstract topics like a software bug. Never another outlet's photo or footage. **Image models** (Waleed, 24 Oct: Z-Image
   Turbo or lower/faster): Z-Image Turbo (Tongyi-MAI, 6B, Apache-2.0) on fal.ai first, about $0.005 per megapixel, 8 steps,
   a few seconds (`pipeline/zimage.ts`, `IMAGE_SOURCE=zimage` + `FAL_KEY`); then FLUX on Workers AI (already wired); Gemini
   through the Mac extension as the free option for key frames when the laptop is free (slow, needs the screen unlocked).
   A local model is not an option on the server (4 CPUs, no GPU), and there is no CPU benchmark for Z-Image Turbo on an
   Intel Mac; a smaller local model (SD-Turbo class) would be worse than any of the three above. About 8 pictures a video
   at half a cent is under 5 cents per video. A **licence ledger** (source URL, licence, author, or "AI-generated:
   model + prompt") is stored on the video and printed in the Telegram preview and the caption credit.
9. **Render**: new Remotion composition `Explainer` in `packages/video`: Ken Burns on stills, crossfades on beats,
   Urdu captions in Noto Nastaliq in 2–4 word chunks (line-height tuned so Nastaliq never clips), Zaviya mark, a thin
   progress bar, an end card. Music bed from our own synthesized tracks, ducked under the voice. Duration is taken from the audio.
10. **QA gate** (rule-based + ffprobe, like the daily video): 1080×1920, AAC 48 kHz, duration 40–65 s, loudness about −14 LUFS,
    no missing images, no caption overflow. **Voice check**: transcribe the finished audio with faster-whisper (Urdu) and
    compare with the script; a mismatch above a threshold re-synthesises that sentence once, then fails the video (this
    is what catches glitches that a rule cannot).
11. **Veto**: Telegram preview (video, script, sources, licence ledger, risk note) with Approve / Skip / Re-render. Existing
    `VIDEO_VETO_MIN` window; `needs-veto` ideas wait for an explicit Approve (`required` mode). First 2 weeks: every
    explainer gets the veto window; after that only sensitive ones.
12. **Post**: IG Reel + FB Reel through `social/reels.ts` (YouTube Shorts when its API audit is through). Caption: a hook line,
    two sentences of description, the link line, 3 hashtags from `social/hashtags.ts`; the article/watch-page link as first comment.
    Writes a `social-posts` row (format `reel`) like the daily videos.

## 2. Components to build

| Piece | Where | Notes |
| --- | --- | --- |
| `tts` service | `infra/tts.Dockerfile`, `apps/tts` (Python) | CPU only; model and vocoder baked into the image; `POST /speak` → wav + per-sentence timings |
| Urdu text normaliser | `apps/tts` (+ prompt rules in the script step) | digits → words, symbol handling, vocabulary check against `vocab.json` |
| Ideas backlog | Payload collection `video-ideas` + `/api/pipeline/video-ideas` | same pattern as pitches/gate; editor reads and writes it with `ops/bin/payload.mjs` |
| Discover/score/pick | `apps/worker/src/video/explainer/` | deterministic filters + LLM scoring with a rubric; unit tests |
| Research/script | `apps/worker/src/video/explainer/` | fact sheet, script JSON schema (zod), guards |
| Visuals | `apps/worker/src/video/explainer/visuals.ts` | reuses `real-photo.ts` and `zimage.ts`/FLUX/Gemini from `media.ts`; licence ledger |
| `Explainer` composition | `packages/video/src/remotion` | pure `composeExplainer()` like `compose()`, tested |
| Round scheduler + veto + post | `apps/worker/src/video/main.ts` | new slot kind `explainer`, `VIDEO_EXPLAINER=true` flag |
| Editor skill | `.claude/agents/editor.md` | item "Video ideas": review top 10, boost/ok/veto, add hand-picked ideas |
| Watch page + `VideoObject` | `apps/web` | one page per explainer, linked from its source articles |
| Metrics | existing metrics pull | watch time per topic class feeds the scoring weights after 2–3 weeks |

## 3. Server capacity (the one real constraint)

The server has 4 CPUs and is already busy: a web build takes 35–45 min and Postgres, worker and video together use most
of the CPU at the evening peak. A 60 s render at concurrency 2 is a few minutes of two CPUs, plus TTS, plus ASR check,
six times a day. Start on the current server with the video service's `cpus: 2` limit and `nice`, measure for a week.
If deploys or the news pipeline slow down, move the `video` and `tts` containers to a second small VPS (they only need
Redis and the public API) — the design needs no change for that.

## 4. Editorial rules (from the editor, Oct 2026)

- Pick first: fresh hook + primary source + a Pakistan angle.
- Never: outlet footage or logos, unverified single-source claims, accusations against named people, violence, deaths or court cases as explainers, price-scare framing.
- Every figure needs a dated official source; sources that disagree are named as such, not averaged.
- AI illustrations are always labelled; never presented as a photo of the event.
- Politically charged or legal-conclusion topics: editor/Waleed veto required.
- Example topics from the editor's first list (to be re-verified by the research step): how the petrol price is set (OGRA notification only), the PHP vulnerability (do not claim breaches without a source; "70% of sites" is a usage share), how a rocket reaches orbit, EU AI Act for freelancers, FPSC eligibility how-to. The Roadster-in-space idea waits for a dated hook.

## 5. Build order

1. **Voice (1–2 days)**: `tts` container, normaliser, ASR check; 5 narrations for review. *Done when* five scripts of 120 words come back
   clean (ASR match ≥ 95 %) in under 20 s each.
2. **Look (2–3 days)**: `Explainer` composition and 2 hand-written samples (petrol price, PHP bug) rendered to MP4 for Waleed to approve the look and voice before any wiring.
3. **Backlog + editor (2 days)**: `video-ideas`, discover, score, editor endpoint and skill; dry run: ranked list in the control room.
4. **Research + script + guards (2 days)**: fact sheet, script, number guard; 10 scripts reviewed by hand.
5. **Pipeline (2 days)**: rounds, QA gate, Telegram veto, post to IG/FB in dry run (`VIDEO_PLATFORMS=` empty), then live with veto on for every video.
6. **Site + learning (2 days)**: watch pages, `VideoObject`, metrics, scoring weights from results.

Nothing posts until step 5 passes a full dry-run day. Rollback is `VIDEO_EXPLAINER=false` or stopping the `tts`/`video` container; the news worker and web are untouched.

## 6. Open decisions

1. Where the first posts land: IG + FB only (recommended), YouTube Shorts when approved.
2. Instagram daily cap: the current cap of 5 is already used up by daily Reels and article cards; explainers need it raised to about 8, or fewer article cards on those days.
3. Render location: current server first (recommended), second VPS if it hurts.
4. Remotion licence: free for companies of up to 3 people; confirm before the volume grows.
5. fal.ai account: Waleed creates it and puts `FAL_KEY` in the server env file (never in chat); until then FLUX/Gemini carry on as today.
6. Voice fatigue: one voice and one style across six videos a day. Plan B when we have a GPU box: OmniVoice or an Urdu fine-tune with more styles.
