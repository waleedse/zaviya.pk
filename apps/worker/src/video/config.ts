import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSlots, type Slot } from './schedule.js'
import { TREND_SLOT_SPEC } from './trend.js'

export type VideoPlatform = 'instagram' | 'facebook'

export interface VideoConfig {
  enabled: boolean
  slots: Slot[]
  /** empty = dry run */
  platforms: VideoPlatform[]
  vetoMin: number
  /** ZAV-150: daily trend-reaction Reel; TREND_REEL=on adds the "trend" slot, off by default */
  trendReel: boolean
  /** 15 s breaking flashes (checked every 10 min); VIDEO_FLASH=false turns them off */
  flash: boolean
  dataDir: string
  bundleDir: string
  concurrency: number
  siteUrl: string
  keepDays: number
  /** VIDEO_VOICED=true: the headline videos get an Urdu voice (made on the Mac) when the agent is online */
  voiced: boolean
  /** VIDEO_EXPLAINER=true: an Urdu explainer video every 3 hours (09:00 to 21:00 PKT) while the Mac agent is online */
  explainer: boolean
  /** media hub for the Mac agent: port and shared token (no token = hub off) */
  mediaHubPort: number
  mediaAgentToken?: string
  /** chrome-headless-shell installed in the image; undefined = Remotion's default lookup */
  browserExecutable?: string
}

const HERE = path.dirname(fileURLToPath(import.meta.url))

export function loadVideoConfig(env: NodeJS.ProcessEnv = process.env): VideoConfig {
  const platforms = (env.VIDEO_PLATFORMS === undefined ? 'instagram,facebook' : env.VIDEO_PLATFORMS)
    .split(',')
    .map((p) => p.trim())
    .filter((p): p is VideoPlatform => p === 'instagram' || p === 'facebook')
  const trendReel = env.TREND_REEL === 'on'
  return {
    enabled: env.VIDEO_ENABLED === 'true',
    trendReel,
    slots: [...parseSlots(env.VIDEO_SLOTS), ...(trendReel ? parseSlots(TREND_SLOT_SPEC) : [])],
    platforms,
    flash: env.VIDEO_FLASH !== 'false',
    vetoMin: Math.max(0, Number(env.VIDEO_VETO_MIN ?? 20) || 0),
    dataDir: env.VIDEO_DATA_DIR ?? '/data/videos',
    bundleDir: env.VIDEO_BUNDLE_DIR ?? path.resolve(HERE, '../../../../packages/video/build/bundle'),
    concurrency: Math.max(1, Number(env.VIDEO_CONCURRENCY ?? 2) || 2),
    siteUrl: (env.VIDEO_SITE_URL ?? 'https://zaviya.pk').replace(/\/+$/, ''),
    keepDays: 14,
    voiced: env.VIDEO_VOICED === 'true',
    explainer: env.VIDEO_EXPLAINER === 'true',
    mediaHubPort: Number(env.MEDIA_HUB_PORT ?? 8790) || 8790,
    mediaAgentToken: env.MEDIA_AGENT_TOKEN || undefined,
    browserExecutable: env.VIDEO_BROWSER_EXECUTABLE || undefined,
  }
}
