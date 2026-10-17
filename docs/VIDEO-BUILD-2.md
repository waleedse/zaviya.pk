# Daily video — build brief, round 2 (polish + formats + topics + hashtags)

This round continues the phase-1 work in `packages/video/`. The hard rules of `docs/VIDEO-BUILD.md` still apply:

- only `packages/video/` (+ .gitignore, lockfile)
- branch `feat/daily-video`
- no commit, push, ssh, deploy or posting
- no LLM, no randomness
- mandatory visual self-review of contact sheets

## Facts behind this round (verified 17 Oct 2026 from the live API)

- **Story volume**: about 45 stories in 12 h and about 69 in 24 h.
  - Mostly pakistan (34/day), business (19/day) and world (8/day).
  - **ai + tech-telecom is only about 4 a day** (ai 5 and tech 8 in 72 h). So the AI/Tech video uses a 96 h window and is published 3× a week, not daily.
- **Articles have `tags[]`** (names like "State Bank of Pakistan", "Donald Trump") at `depth=1`. These are the hashtag source.
- **Instagram's hashtag cap**: since 18 Dec 2025 Instagram allows **at most 5 hashtags** per post or Reel, counting the caption and comments together.
- **YouTube hashtags**: YouTube ignores *all* hashtags if there are more than 15. The first 3 show above the title.

## A. Polish fixes (from review of round 1)

1. **Fake Urdu**: remove the `_testUr` Urdu lines from fixtures. Show Urdu only when the article really has `titleUr` (none do today). Nastaliq support stays in code.
2. **Hook highlight swipe**: it covers only part of line 2 ("TO K", "30 SE"). It must sweep behind the *whole* second line and end exactly at its measured width. Check at frames 20 and 40.
3. **Highlight colour flip**: the highlighted words' text colour flips mid-swipe for 1–2 frames. Make the text colour switch exactly when the swipe passes each word (or clip the dark text with the same `scaleX` mask), so there is never a flicker.
4. **Photo panel seam**: there is a thin bright vertical line at the right edge of the panel in some frames (evening story 2). Overscan the image by 4% so the pan never exposes an edge.
5. **Breaking ticker strip**: it overlaps the logo and progress bar. Move it to sit directly *under* the photo panel (at the top edge of the text area), 56 px tall.
6. **Numbers**: when the delta is `flat`, show "—" in grey instead of a dot. Hide the source line when it is longer than the tile.

## B. Dynamic photo / dark area (user request)

The dark text area must adapt to how much text there is. **Less text → smaller dark area → bigger photo.**

- New pure function `layoutStory(metrics) → { photoHeight, textTop, gradientStart, overlayOpacity }` in `src/layout.ts`, unit-tested.
  - Inputs: the measured heights of the headline block, figure, dek, Urdu line and credit (measure them with `measureText` and your own line wrapping, already done for the headline).
- Rules:
  - The text block is bottom-anchored at y = 1920 − 240 (safe area).
  - `textTop = 1680 − textHeight`.
  - `photoHeight = clamp(textTop − 40, 760, 1240)`.
  - The photo panel's bottom gradient starts 160 px above `textTop`.
  - The overlay behind the text scales with text density: `overlayOpacity = clamp(0.55 + 0.25 * (textHeight / 900), 0.55, 0.85)`.
  - Short text gets a lighter, smaller dark area; long text gets a darker, bigger one.
  - The photo panel cover-fits the new height (upscale is acceptable up to about 2.2×; beyond that, add a subtle 0.6 px sharpen filter or just accept it).
- The dek fills space only when `textHeight` would still leave `photoHeight ≥ 900`. Otherwise drop the dek.
- Tests:
  - short headline only → photoHeight ≥ 1100
  - long headline + figure + dek → photoHeight 760 and the dek dropped
  - opacity bounds

## C. Formats: variable length and many more stories (user request)

Replace the fixed 900 frames with **format presets**. `compose(input, format)`:

| format | total | stories | structure |
|---|---|---|---|
| `flash15` | 15 s (450 f) | 1 | BREAKING hook 1.5 s, one full story about 10 s with dek always shown, short outro 2.5 s ("Follow for live updates") |
| `headlines30` | 30 s (900 f) | up to 6 | hook, 6 stories (min 3.5 s each; fewer stories means longer scenes), outro |
| `roundup60` | 60 s (1800 f) | up to 12 | hook, 8 full stories, **Numbers** after story 4, a **"MORE HEADLINES"** quick-hits scene with 4 short headlines, outro |
| `topic60` | 60 s (1800 f) | 5–8 | topic hook, stories each with the dek always shown (explainer style, 5.5–7 s each), outro |
| `money45` | 45 s (1350 f) | up to 6 | hook, Numbers *first*, then business stories, outro |

**Duration and timing rules:**

- The total must still be exact for every format and every story count (scenes plus overlapping transitions). Test them all: flash with 1 story; headlines30 with 3–6; roundup60 with 6–12 (quick hits only when there are more than 8); topic60 with 5–8; money45 with 3–6, with and without numbers.
- Every story gets at least 3.0 s on screen. If there are too many stories for the time, cut the lowest-ranked ones.
- Cuts land on beats as before.

**Scenes and labels:**

- **Quick hits scene** (`scenes/QuickHits.tsx`, about 7 s):
  - Title "MORE HEADLINES".
  - 4 rows, each with a category colour bar, a number (9–12) and the shortened headline (≤ 60 chars, Inter 800, 52 px).
  - Rows slide in one per beat, and each row's thumbnail (a 160×160 crop of its photo) pops in.
  - The progress bar treats quick hits as one segment.
- **Progress bar**: it handles up to 9 segments (8 stories + quick hits). The badge shows `7/12`-style numbering across all stories, including the quick-hit numbers.
- **Hook titles**:
  - headlines30 morning: `N STORIES / TO KNOW TODAY`
  - roundup60 evening: `TODAY IN / 60 SECONDS`
  - topic60 ai-tech: `AI & TECH / THIS WEEK`
  - money45: `MONEY / IN 45 SECONDS`
  - flash15: `BREAKING / {CATEGORY}`
- **Outro CTA**: `Comment 1–N` uses the total story count; flash15 uses "Follow for live updates".

## D. Topic edition: AI & Tech (user request) and Money

- `EditionInput` gets `topic?: 'ai-tech' | 'money' | null`.
- **Fixture selection**:
  - ai-tech: categories `ai` + `tech-telecom`, 96 h window, at least 5 stories (if fewer, extend the window to 168 h).
  - money: category `business` from the last 12 h + rates.
- **Theme `tech`**:
  - background `#05070F`
  - accents cyan `#22D3EE` and violet `#7B4DFF`
  - a subtle animated grid or dot-matrix background (lines drift slowly with the frame)
  - highlight swipe in cyan, chip colours as usual
  - music mood `night`
- **Theme for money**: sunrise colours with lime `#C6FF3D` accents for figures.

## E. Captions + hashtags generator (user request: "full hashtags, achay laga kay")

New pure module `src/captions.ts`:
`buildCaptions(timeline, stories, { platform, trends?: string[], url: string }) → { title?: string; text: string; hashtags: string[]; firstComment?: string }`.

**Hashtag sources** (rule-based, in priority order, deduped case-insensitively):

1. A topic or edition core tag: `#PakistanNews` (headlines/roundup/flash), `#AI` (ai-tech), `#PakistanEconomy` (money).
2. The tags of the lead story and then the next stories, converted to CamelCase (`State Bank of Pakistan` → `#StateBankOfPakistan`).
   - Strip non-alphanumerics and keep ASCII only.
   - Skip tags longer than 24 chars or shorter than 3.
   - Skip generic words (news, latest, update, today, pakistan-only duplicates).
3. Trending terms: if any `trends` string (passed in; the fixture script can fetch nothing and pass an empty array) appears in a story headline or tags, it is ranked right after the core tag.
4. Category tags: pakistan → `#Pakistan`, business → `#Business`, world → `#WorldNews`, tech-telecom → `#Tech`, ai → `#ArtificialIntelligence`, cricket → `#Cricket`, education-jobs → `#Jobs`.
5. Brand `#Zaviya` is always last.

**Per-platform rules:**

| Platform | Hashtags | Caption |
|---|---|---|
| instagram | exactly ≤ 5 | Hook line, date, numbered headlines (all stories), "Comment the number you want explained 👇", "Full stories: link in bio", then the 5 hashtags on the last line. ≤ 2,200 chars (drop dek lines first if over). |
| facebook | 3 | The same text, but with the direct link `https://zaviya.pk/?utm_source=facebook&utm_medium=video&utm_campaign=<edition>`. |
| tiktok | 5 | Shorter: hook line + the first 5 headlines + "Comment 1–N" + hashtags. ≤ 2,200. |
| youtube | ≤ 3 in the description | `title` ≤ 100 chars, like "Pakistan News Today: {lead short headline} & {N-1} more #Shorts". Description: the numbered headlines; for roundup60 add chapter-like lines "0:02 1. …" computed from the timeline; link; the 3 hashtags. |
| x | ≤ 2 | ≤ 280 chars total, counting a URL as 23. |
| threads | 1 | ≤ 500 chars. |

- Every link uses `utm_source=<platform>&utm_medium=video&utm_campaign=<format>-<date>`.
- **Tests**: IG never > 5; YouTube ≤ 3 and the title ≤ 100; X ≤ 280 with URL weighting; CamelCase conversion; dedupe; trending boost; length trimming.
- `render-samples` writes `out/<name>-captions.json` with every platform's output.

## F. Samples to render this round

| Name | Format | Data |
|---|---|---|
| `morning-30` | headlines30 | latest 14 h, 6 stories |
| `evening-60` | roundup60 | latest 12 h, 12 stories, different from morning where possible |
| `ai-tech-60` | topic60 | ai + tech-telecom, 96 h |
| `money-45` | money45 | business 12 h + rates |
| `breaking-15` | flash15 | morning's 2nd story marked breaking |
| `sombre-30` | headlines30 | as before |

Selection rules as in round 1: rank by priority, then newest; hero image required; naive same-story dedupe; at most 2 per category in headlines30, at most 4 per category in roundup60 (pakistan up to 5).

Delete the round-1 outputs (`morning.mp4`, etc.) from `out/` before rendering so there's no confusion.

The 60 s renders will take a while: run them with long timeouts, one at a time, `concurrency: 2`.

## Definition of done

- Tests and typecheck pass. The new tests cover:
  - layoutStory
  - every format's exact frame total
  - quick-hits threshold
  - topic selection helpers
  - captions and hashtags
- All 6 MP4s pass QA. The duration check adapts to the format: ±0.5 s of 15/30/45/60.
- Contact sheets are reviewed with Read and fixed.
  - Use 8 frames for 15/30 s and 12 frames (a 4×3 grid) for 45/60 s.
  - The sheets must show the quick hits scene, the tech theme, the money numbers-first layout, and the dynamic panel (one short-headline story with a visibly bigger photo).
- The captions JSON exists for all 6.
- Final report: what changed; render time per video; QA; a sample IG caption and YouTube title for evening-60; deviations; known weaknesses; file paths; and confirmation that nothing was committed and nothing outside the allowed paths was touched.
