/**
 * YouTube posting settings. Kill switch: YOUTUBE_SHORTS=0 stops new videos from being queued and stops the uploader
 * (what is already queued stays queued and goes up when it is turned back on).
 */
export interface YoutubeConfig {
  enabled: boolean
  /** the channel's UC... id: its upload page is opened, so a second channel on the Google account is never used by mistake */
  channelId: string
  /** public base of the media hub (nginx exposes the hub as /media/ on the sslip.io host); the extension downloads the MP4 from here */
  mediaBase: string
  /** least time between two uploads (YouTube flags bursts; the backfill is slow on purpose) */
  minGapMs: number
  /** how often the uploader looks at the queue */
  tickMs: number
  /** after "Daily upload limit reached" the queue sleeps this long, then tries again (the limit is a rolling 24 hours) */
  limitPauseMs: number
  /** where a failed upload's screenshot is saved (the worker log carries the path) */
  debugDir: string
  /** the site that story links point at */
  siteUrl: string
}

export function loadYoutubeConfig(env: NodeJS.ProcessEnv = process.env): YoutubeConfig {
  const off = /^(0|false|off|no)$/i.test((env.YOUTUBE_SHORTS ?? '').trim())
  return {
    enabled: !off,
    channelId: env.YOUTUBE_CHANNEL_ID?.trim() || 'UCCzAybBVt3TIIgvBoSHJy8Q',
    mediaBase: (env.YOUTUBE_MEDIA_BASE?.trim() || 'https://zaviya.194-163-184-12.sslip.io/media').replace(/\/+$/, ''),
    minGapMs: Math.max(1, Number(env.YOUTUBE_MIN_GAP_MIN ?? 5) || 5) * 60_000,
    tickMs: 30_000,
    limitPauseMs: Math.max(30, Number(env.YOUTUBE_LIMIT_PAUSE_MIN ?? 240) || 240) * 60_000,
    debugDir: env.YOUTUBE_DEBUG_DIR?.trim() || '/tmp/yt-failures',
    siteUrl: (env.VIDEO_SITE_URL ?? 'https://zaviya.pk').replace(/\/+$/, ''),
  }
}
