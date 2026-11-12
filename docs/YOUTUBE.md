# YouTube uploads (channel "Zaviya PK", @zaviya-pk)

Every video the media pipeline makes (daily digests, breaking flashes, explainers) is also uploaded to the YouTube channel,
public, through YouTube Studio in Waleed's logged-in Chrome. No YouTube Data API is used (see "API path" below).

## How it works

```
video service (videodata volume)            main worker (owns the bridge)               Chrome extension (Waleed's Mac)
  render video.mp4 + captions/script  --->   uploader loop (every 30 s)
  enqueueLive(dir)  -> Redis yt:queue         pops the next item, mints a 40 min token
  media hub GET /yt/<token>.mp4  <------------ videoUrl in the youtube.upload job -----> fetches the MP4, opens
  (nginx: https://<sslip host>/media/yt/...)                                              studio.youtube.com/channel/<id>/videos/upload,
                                              <---- {videoId, url} or error ------------  sets title/description/not-for-kids/Public, publishes
```

- Queue (Redis): `yt:items` + `yt:order` (queued), `yt:done`, `yt:skipped`, `yt:failed`, `yt:state` (pause, last upload, inflight).
  Order: made-just-now first, then backfilled explainers, then backfilled digests, oldest first inside each.
- Idempotency: the id is `sha1("youtube:" + edition folder name)`. A video is never queued, uploaded or recorded twice
  (live and backfill share the id). The `social_posts` row has `platform: youtube`, `format: short` (or `video` over 3 minutes),
  `via: extension`, `externalId` = the YouTube video id, `status`, `error`.
- Titles: the headline in search words plus ` #Shorts` (Shorts only, at most 100 characters). Description: a few lines, the zaviya.pk
  link, hashtags (digests reuse the trending-hashtag caption of the `youtube` platform in `packages/video/src/captions.ts`).
  Over 3 minutes the video goes up as a normal video, without `#Shorts`.
- "Altered or synthetic content" is answered Yes for explainers (AI pictures) and No for digests (real photos), truthfully.
- Guards: no stricter than what the same videos already passed on Facebook and Instagram (sensitive news is not held back). Only the
  pipeline's hard block stays (blasphemy, sectarian, minors, Pakistani party-political and army names), checked when queued and again
  at upload time. Old videos with a price or rate (more than 3 days old) are skipped because the number has changed since. Every skip
  is stored with its reason (`yt:skipped`); `backfill --reconsider` clears the skip decisions and looks again under the current rules.
- Extension version: the worker sends `youtube.upload` only to an extension that reported 0.5.0 or newer in its hello (older ones ignore
  the job without answering); otherwise the queue waits and nothing is lost.
- Pacing: at least `YOUTUBE_MIN_GAP_MIN` (5) minutes between uploads, no daily cap, no quiet hours.
  "Daily upload limit reached" in Studio (new channels, about 10-15 uploads in 24 h) puts the queue to sleep for
  `YOUTUBE_LIMIT_PAUSE_MIN` (240) minutes, then it tries again by itself.
- Failures: the extension returns a screenshot and a page summary (`job.debug` bridge message); the worker logs the summary,
  saves the JPEG under `YOUTUBE_DEBUG_DIR` and sends it to the Telegram admin chat. An attempt that failed before publishing is retried
  up to 3 times (10 minutes apart). If the outcome is unknown (publish clicked, no link seen; bridge timeout; worker restarted
  during the upload) the video is marked failed and never repeated: check the channel. Verification or login prompts pause the
  queue for 6 hours and send a Telegram message.
- Kill switch: `YOUTUBE_SHORTS=0` in `worker.env` (restart worker and video). Nothing new is queued and the uploader idles; the
  queue is kept.

## Settings (env)

| Variable | Default | Meaning |
|---|---|---|
| `YOUTUBE_SHORTS` | on | `0`, `false` or `off` switches everything off |
| `YOUTUBE_CHANNEL_ID` | `UCCzAybBVt3TIIgvBoSHJy8Q` | channel whose Studio upload page is opened |
| `YOUTUBE_MEDIA_BASE` | `https://zaviya.194-163-184-12.sslip.io/media` | public base of the media hub (nginx `/media/`) |
| `YOUTUBE_MIN_GAP_MIN` | 5 | least minutes between uploads |
| `YOUTUBE_LIMIT_PAUSE_MIN` | 240 | sleep after "Daily upload limit reached" |
| `YOUTUBE_DEBUG_DIR` | `/tmp/yt-failures` | where failure screenshots are saved |

## Operating it

Inside the video container (it has the files and the same Redis):

```
docker exec zaviya-video-1 node --import tsx src/youtube/cli.ts backfill --dry   # what would be queued, what is skipped and why
docker exec zaviya-video-1 node --import tsx src/youtube/cli.ts backfill         # queue everything posted so far
docker exec zaviya-video-1 node --import tsx src/youtube/cli.ts status           # counts, pause state, uploaded links
```

Waleed must: keep Chrome open and logged in to the Google account that owns the channel (the extension opens its own Studio tab in
the background), reload the extension (v0.5.0) at `chrome://extensions`, and approve any one-time YouTube check Studio shows
(phone verification is only needed for videos over 15 minutes; Shorts do not need it).

## API path (not used, for later)

The YouTube Data API `videos.insert` works without Chrome, but an API project that has not passed Google's compliance audit
uploads every video as **private** (locked) and the default quota is 10,000 units per day (an upload costs 1,600, so 6 a day).
Steps if it is ever worth it: (1) Google Cloud project, enable YouTube Data API v3, OAuth consent screen (External, scope
`youtube.upload`), OAuth client; (2) authorise once as the channel owner and store the refresh token as a secret;
(3) submit the "YouTube API Services - Audit and Quota Extension Form" for the project; (4) only after approval do uploads
become public. Until then the Studio path above is the only one that publishes publicly.
