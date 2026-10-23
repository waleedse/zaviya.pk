/**
 * Node-only rendering for the video worker. Uses a PREBUILT bundle (see scripts/bundle.ts), never bundles at runtime.
 * Exported as `@zaviya/video/render`.
 */
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { FPS } from './constants'
import { checkVideo, QaError, type QaResult } from './qa'
import type { NarratedTimeline } from './narrated'
import type { Timeline } from './types'

export { QaError } from './qa'
export type { QaResult } from './qa'

export interface RenderEditionOptions {
  timeline: Timeline
  outDir: string
  /** directory made by `pnpm bundle` (build/bundle) */
  bundleDir: string
  concurrency?: number
  /** directory with the story photos named in `timeline` scenes (copied into the bundle's public folder for the render) */
  imagesDir?: string
  /** a chrome-headless-shell binary to use (the docker image has one installed at build time: nothing is downloaded while rendering) */
  browserExecutable?: string | null
  onProgress?: (progress: number) => void
}

export interface RenderEditionResult {
  mp4: string
  cover: string
  durationMs: number
  qa: QaResult
}

export async function renderEdition(o: RenderEditionOptions): Promise<RenderEditionResult> {
  const started = Date.now()
  mkdirSync(o.outDir, { recursive: true })
  if (!existsSync(path.join(o.bundleDir, 'index.html'))) throw new Error(`no bundle at ${o.bundleDir}: run pnpm --filter @zaviya/video bundle`)

  const publicImages = path.join(o.bundleDir, 'public', 'fixtures-images')
  const copied: string[] = []
  if (o.imagesDir) {
    mkdirSync(publicImages, { recursive: true })
    for (const f of readdirSync(o.imagesDir)) {
      cpSync(path.join(o.imagesDir, f), path.join(publicImages, f))
      copied.push(path.join(publicImages, f))
    }
  }

  const inputProps = { timeline: o.timeline }
  const mp4 = path.join(o.outDir, 'video.mp4')
  const cover = path.join(o.outDir, 'cover.png')
  try {
    const comp = await selectComposition({ serveUrl: o.bundleDir, id: 'DailyHeadlines', inputProps, browserExecutable: o.browserExecutable ?? null })
    if (comp.durationInFrames !== o.timeline.totalFrames) throw new Error('composition duration does not match the timeline')
    let last = -1
    await renderMedia({
      composition: comp,
      serveUrl: o.bundleDir,
      browserExecutable: o.browserExecutable ?? null,
      codec: 'h264',
      pixelFormat: 'yuv420p',
      imageFormat: 'jpeg',
      audioCodec: 'aac',
      crf: 20,
      concurrency: o.concurrency ?? 2,
      inputProps,
      outputLocation: mp4,
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 10)
        if (pct !== last) {
          last = pct
          o.onProgress?.(progress)
        }
      },
    })
    const coverComp = await selectComposition({ serveUrl: o.bundleDir, id: 'Cover', inputProps, browserExecutable: o.browserExecutable ?? null })
    await renderStill({ composition: coverComp, serveUrl: o.bundleDir, output: cover, inputProps, imageFormat: 'png', browserExecutable: o.browserExecutable ?? null })
  } finally {
    for (const f of copied) rmSync(f, { force: true })
  }

  const qa = await checkVideo(mp4, o.timeline.totalFrames / FPS)
  if (!qa.pass) throw new QaError(qa, mp4)
  return { mp4, cover, durationMs: Date.now() - started, qa }
}

// ---- story photo helpers (used by the worker before rendering) -----------------------------

/** true when the file is an image that decodes */
export async function imageDecodes(file: string): Promise<boolean> {
  try {
    const sharp = (await import('sharp')).default
    const meta = await sharp(file).metadata()
    return !!meta.width && !!meta.height
  } catch {
    return false
  }
}

/** Category-colour gradient with a faint grid, used when a hero image is missing or broken (1600x900 JPEG). */
export async function makeGradientImage(color: string, file: string): Promise<void> {
  const sharp = (await import('sharp')).default
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#081410"/></linearGradient>
<pattern id="p" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#fff" stroke-opacity="0.08" stroke-width="2"/></pattern></defs>
<rect width="1600" height="900" fill="url(#g)"/><rect width="1600" height="900" fill="url(#p)"/></svg>`
  await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(file)
}

// ---- narrated videos (explainers, voiced news) -------------------------------------------------

export interface RenderNarratedOptions {
  timeline: NarratedTimeline
  outDir: string
  bundleDir: string
  /** folder with the voice WAV and the pictures named in the timeline; copied into the bundle's public/narrated for the render */
  assetsDir: string
  concurrency?: number
  browserExecutable?: string | null
  onProgress?: (progress: number) => void
}

/** The server and the Mac can be busy with other jobs while a render starts: give the browser two minutes, not Remotion's 28 seconds */
const SLOW_MS = 120_000

export async function renderNarrated(o: RenderNarratedOptions): Promise<RenderEditionResult> {
  const started = Date.now()
  mkdirSync(o.outDir, { recursive: true })
  if (!existsSync(path.join(o.bundleDir, 'index.html'))) throw new Error(`no bundle at ${o.bundleDir}: run pnpm --filter @zaviya/video bundle`)
  const publicDir = path.join(o.bundleDir, 'public', 'narrated')
  mkdirSync(publicDir, { recursive: true })
  const copied: string[] = []
  for (const f of readdirSync(o.assetsDir)) {
    cpSync(path.join(o.assetsDir, f), path.join(publicDir, f))
    copied.push(path.join(publicDir, f))
  }
  const inputProps = { timeline: o.timeline }
  const mp4 = path.join(o.outDir, 'video.mp4')
  const cover = path.join(o.outDir, 'cover.png')
  const browserExecutable = o.browserExecutable ?? null
  try {
    const comp = await selectComposition({ serveUrl: o.bundleDir, id: 'Narrated', inputProps, browserExecutable, timeoutInMilliseconds: SLOW_MS })
    if (comp.durationInFrames !== o.timeline.totalFrames) throw new Error('composition duration does not match the timeline')
    let last = -1
    await renderMedia({
      composition: comp,
      serveUrl: o.bundleDir,
      browserExecutable,
      codec: 'h264',
      pixelFormat: 'yuv420p',
      // PNG frames: with JPEG frames ffmpeg ends up with full-range yuvj420p, which the QA gate (and some platforms) refuse
      imageFormat: 'png',
      audioCodec: 'aac',
      crf: 20,
      concurrency: o.concurrency ?? 2,
      timeoutInMilliseconds: SLOW_MS,
      inputProps,
      outputLocation: mp4,
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 10)
        if (pct !== last) {
          last = pct
          o.onProgress?.(progress)
        }
      },
    })
    const first = o.timeline.beats[0]!
    await renderStill({ composition: comp, serveUrl: o.bundleDir, output: cover, inputProps, timeoutInMilliseconds: SLOW_MS, frame: Math.min(first.from + 40, o.timeline.totalFrames - 1), imageFormat: 'png', browserExecutable })
  } finally {
    for (const f of copied) rmSync(f, { force: true })
  }
  const qa = await checkVideo(mp4, o.timeline.totalFrames / FPS)
  if (!qa.pass) throw new QaError(qa, mp4)
  return { mp4, cover, durationMs: Date.now() - started, qa }
}
