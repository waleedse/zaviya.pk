import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSlots, type Slot } from './schedule.js'

export type VideoPlatform = 'instagram' | 'facebook'

export interface VideoConfig {
  enabled: boolean
  slots: Slot[]
  /** empty = dry run */
  platforms: VideoPlatform[]
  vetoMin: number
  dataDir: string
  bundleDir: string
  concurrency: number
  siteUrl: string
  keepDays: number
  /** chrome-headless-shell installed in the image; undefined = Remotion's default lookup */
  browserExecutable?: string
}

const HERE = path.dirname(fileURLToPath(import.meta.url))

export function loadVideoConfig(env: NodeJS.ProcessEnv = process.env): VideoConfig {
  const platforms = (env.VIDEO_PLATFORMS === undefined ? 'instagram,facebook' : env.VIDEO_PLATFORMS)
    .split(',')
    .map((p) => p.trim())
    .filter((p): p is VideoPlatform => p === 'instagram' || p === 'facebook')
  return {
    enabled: env.VIDEO_ENABLED === 'true',
    slots: parseSlots(env.VIDEO_SLOTS),
    platforms,
    vetoMin: Math.max(0, Number(env.VIDEO_VETO_MIN ?? 20) || 0),
    dataDir: env.VIDEO_DATA_DIR ?? '/data/videos',
    bundleDir: env.VIDEO_BUNDLE_DIR ?? path.resolve(HERE, '../../../../packages/video/build/bundle'),
    concurrency: Math.max(1, Number(env.VIDEO_CONCURRENCY ?? 2) || 2),
    siteUrl: (env.VIDEO_SITE_URL ?? 'https://zaviya.pk').replace(/\/+$/, ''),
    keepDays: 14,
    browserExecutable: env.VIDEO_BROWSER_EXECUTABLE || undefined,
  }
}
