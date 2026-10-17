/**
 * Bundles once, then renders the sample MP4s, cover PNGs and contact sheets for the fixtures.
 *   pnpm samples                      all four, full
 *   pnpm samples morning sombre       only those
 *   pnpm samples --sheets-only        skip the MP4 (fast, for visual iteration)
 *   SHEET_SCALE=0.5 pnpm samples ...  contact sheet tile scale (default 0.4)
 *   FRAMES=10,30,44 pnpm samples morning --sheets-only   custom frames, written to out/<name>-custom.png
 */
import { bundle } from '@remotion/bundler'
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { buildAllCaptions } from '../src/captions'
import { compose, sceneStarts } from '../src/compose'
import { H, W } from '../src/constants'
import type { EditionInput, Timeline } from '../src/types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'out')
const custom = process.env.FRAMES?.split(',').map(Number)
const NAMES = ['morning-30', 'evening-60', 'ai-tech-60', 'money-45', 'breaking-15', 'sombre-30']

/** One frame per scene (hook and others once their text has settled); extras go into the longest scenes. */
function pickFrames(t: Timeline, count: number): number[] {
  const starts = sceneStarts(t.scenes, t.transitionFrames)
  const at = (i: number, f: number) => starts[i]! + Math.round(t.scenes[i]!.durationInFrames * f)
  let list = t.scenes.map((s, i) => ({ i, f: s.kind === 'hook' ? 0.62 : s.kind === 'outro' ? 0.8 : 0.5 }))
  if (list.length > count) {
    const keep = new Set(Array.from({ length: count }, (_, k) => Math.round((k * (list.length - 1)) / (count - 1))))
    list = list.filter((_, k) => keep.has(k))
  }
  const extra = [0.2, 0.8, 0.35, 0.65]
  let k = 0
  while (list.length < count) {
    const longest = t.scenes.map((s, i) => ({ i, d: s.durationInFrames / (1 + list.filter((x) => x.i === i).length) })).sort((a, b) => b.d - a.d)[0]!
    list.push({ i: longest.i, f: extra[k++ % extra.length]! })
  }
  return list
    .map(({ i, f }) => Math.min(t.totalFrames - 1, at(i, f)))
    .sort((a, b) => a - b)
}

const args = process.argv.slice(2)
const sheetsOnly = args.includes('--sheets-only')
const names = args.filter((a) => !a.startsWith('--'))
const selected = names.length ? names : NAMES
const scale = Number(process.env.SHEET_SCALE ?? 0.4)

async function main() {
  mkdirSync(path.join(OUT, 'timelines'), { recursive: true })
  mkdirSync(path.join(OUT, 'frames'), { recursive: true })

  const t0 = Date.now()
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, 'src/remotion/index.ts'),
    publicDir: path.join(ROOT, 'public'),
    onProgress: () => {},
  })
  console.log(`bundled in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  const times: Record<string, number> = {}
  for (const name of selected) {
    const file = path.join(ROOT, 'fixtures', `${name}.json`)
    if (!existsSync(file)) throw new Error(`missing fixture ${file}: run pnpm fixtures`)
    const input = JSON.parse(readFileSync(file, 'utf8')) as EditionInput
    const timeline: Timeline = compose(input)
    writeFileSync(path.join(OUT, 'timelines', `${name}.json`), JSON.stringify(timeline, null, 2) + '\n')

    const inputProps = { timeline }
    const comp = await selectComposition({ serveUrl, id: 'DailyHeadlines', inputProps })
    if (comp.durationInFrames !== timeline.totalFrames) throw new Error('composition duration mismatch')

    if (!sheetsOnly) {
      const start = Date.now()
      let last = -1
      await renderMedia({
        composition: comp,
        serveUrl,
        codec: 'h264',
        pixelFormat: 'yuv420p',
        imageFormat: 'png',
        audioCodec: 'aac',
        crf: 20,
        concurrency: 2,
        inputProps,
        outputLocation: path.join(OUT, `${name}.mp4`),
        onProgress: ({ progress }) => {
          const pct = Math.floor(progress * 10)
          if (pct !== last) {
            last = pct
            process.stdout.write(`\r${name}: ${pct * 10}%`)
          }
        },
      })
      times[name] = (Date.now() - start) / 1000
      console.log(`\n${name}: rendered in ${times[name]!.toFixed(1)}s`)
    }

    const coverComp = await selectComposition({ serveUrl, id: 'Cover', inputProps })
    await renderStill({ composition: coverComp, serveUrl, output: path.join(OUT, `${name}-cover.png`), inputProps, imageFormat: 'png' })

    writeFileSync(path.join(OUT, `${name}-captions.json`), JSON.stringify(buildAllCaptions(timeline, input.stories, 'https://zaviya.pk'), null, 2) + '\n')

    const FRAMES = custom ?? pickFrames(timeline, timeline.totalFrames >= 1350 ? 12 : 8)
    const tiles: string[] = []
    for (const f of FRAMES) {
      const out = path.join(OUT, 'frames', `${name}-${String(f).padStart(3, '0')}.png`)
      await renderStill({ composition: comp, serveUrl, frame: Math.min(f, comp.durationInFrames - 1), output: out, inputProps, imageFormat: 'png', scale })
      tiles.push(out)
    }
    const tw = Math.round(W * scale)
    const th = Math.round(H * scale)
    const gap = 8
    await sharp({ create: { width: tw * 4 + gap * 5, height: th * Math.ceil(FRAMES.length / 4) + gap * (Math.ceil(FRAMES.length / 4) + 1), channels: 3, background: '#222' } })
      .composite(tiles.map((input, i) => ({ input, left: gap + (i % 4) * (tw + gap), top: gap + Math.floor(i / 4) * (th + gap) })))
      .png()
      .toFile(path.join(OUT, custom ? `${name}-custom.png` : `${name}-sheet.png`))
    console.log(`${name}: cover + sheet written`)
  }
  if (Object.keys(times).length) {
    const file = path.join(OUT, 'render-times.json')
    const prev = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, number>) : {}
    writeFileSync(file, JSON.stringify({ ...prev, ...times }, null, 2) + '\n')
    console.log('render times (s):', times)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
