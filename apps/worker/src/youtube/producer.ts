/**
 * Putting videos on the YouTube queue: every new video as soon as it is made (called by the video service), and the
 * backfill of everything the service still has on disk (one-off CLI). Both go through the same item builder and the same
 * content guard, and the same id per edition folder, so nothing is queued twice.
 */
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { logger } from '../logger.js'
import { itemFromDir, itemId, probeFromTimeline, type ItemResult } from './plan.js'
import type { EnqueueResult, YtStore } from './queue.js'

/** Frames per second of the video package (packages/video constants) */
export const VIDEO_FPS = 30

export interface ProduceOptions {
  siteUrl: string
  articleId?: string
  now?: number
}

/** A video that was just made and is going out on the other platforms: queue it for YouTube at once (tier 0). */
export async function enqueueLive(store: YtStore, dir: string, opts: ProduceOptions): Promise<EnqueueResult | 'blocked'> {
  const res = await itemFromDir(dir, { siteUrl: opts.siteUrl, tier: 0, articleId: opts.articleId, probe: probeFromTimeline(VIDEO_FPS) }, opts.now)
  if ('skip' in res) {
    logger.info({ dir, reason: res.skip }, 'video not queued for YouTube')
    // a guard decision is final; a missing file is not (the render may still be finishing)
    if (!/no video\.mp4/.test(res.skip)) await store.skip(itemId(path.basename(dir)), path.basename(dir), res.skip, opts.now)
    return 'blocked'
  }
  const r = await store.enqueue(res.item)
  logger.info({ key: res.item.key, short: res.item.short, result: r }, 'video queued for YouTube')
  return r
}

export interface BackfillReport {
  found: number
  queued: number
  alreadyKnown: number
  skipped: { key: string; reason: string }[]
}

/**
 * Everything still on disk that was actually posted elsewhere (`posted(key)` says so: not vetoed, not a dry run, not failed),
 * explainers before digests, oldest first inside each. Skipped videos are recorded with the reason (guard or outdated hook).
 */
export async function backfill(
  store: YtStore,
  dataDir: string,
  opts: { siteUrl: string; posted(key: string): Promise<boolean>; now?: number; dryRun?: boolean },
): Promise<BackfillReport> {
  const report: BackfillReport = { found: 0, queued: 0, alreadyKnown: 0, skipped: [] }
  const dirs = readdirSync(dataDir).filter((n) => /^\d{4}-\d{2}-\d{2}-/.test(n)).sort()
  for (const name of dirs) {
    const dir = path.join(dataDir, name)
    report.found++
    if (!(await opts.posted(name))) {
      report.skipped.push({ key: name, reason: 'not posted on the other platforms (vetoed, dry run, failed or still running)' })
      continue
    }
    let res: ItemResult
    try {
      res = await itemFromDir(dir, { siteUrl: opts.siteUrl, tier: 2, probe: probeFromTimeline(VIDEO_FPS) }, opts.now)
    } catch (e) {
      report.skipped.push({ key: name, reason: `unreadable: ${String(e).slice(0, 120)}` })
      continue
    }
    if ('skip' in res) {
      report.skipped.push({ key: name, reason: res.skip })
      if (!opts.dryRun && !/no video\.mp4/.test(res.skip)) await store.skip(itemId(name), name, res.skip, opts.now)
      continue
    }
    if (opts.dryRun) {
      report.queued++
      continue
    }
    const r = await store.enqueue(res.item)
    if (r === 'queued') report.queued++
    else report.alreadyKnown++
  }
  return report
}
