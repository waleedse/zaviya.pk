/**
 * Makes a narrated video from a spec (beats of Urdu text + picture prompts) with the media hub and the Mac agent:
 *   pnpm tsx scripts/make-narrated.ts samples/scam-explainer.json <outDir> [--render]
 * Starts a local hub on :8790 (agent: HUB_URL=http://127.0.0.1:8790 MEDIA_AGENT_TOKEN=dev). Output: voice.wav, beatN.png, timeline.json, video.mp4.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { composeNarrated, renderNarrated, type NarratedInput } from '../src/video/lib.js'
import { MediaHub, memoryHubStore, startMediaHubServer, type TtsPayload } from '../src/video/media-hub.js'
import { speechSentences, toSpeechText } from '../src/video/urdu-speech.js'

interface Spec {
  title: string
  titleUr: string
  cta: string
  music?: string
  imageStyle: string
  beats: { kicker?: string; credit?: string; text: string; imagePrompt: string }[]
}

const [specFile, outDir = '.'] = process.argv.slice(2)
if (!specFile) throw new Error('usage: make-narrated.ts <spec.json> <outDir> [--render]')
const spec = JSON.parse(readFileSync(specFile, 'utf8')) as Spec
mkdirSync(outDir, { recursive: true })

const hub = new MediaHub(memoryHubStore(), path.join(outDir, '.hub'))
startMediaHubServer(hub, { port: 8790, token: 'dev', host: '127.0.0.1' })

// one voice job for every sentence, so the voice is steady; remember which beat each sentence belongs to
const shown: { beat: number; text: string }[] = []
const spoken: string[] = []
spec.beats.forEach((b, bi) => {
  for (const s of b.text.split(/(?<=[۔؟])\s*/).filter(Boolean)) {
    const speech = toSpeechText(s)
    if (speech.unresolved.length) throw new Error(`cannot read English words aloud in beat ${bi + 1}: ${speech.unresolved.join(', ')}`)
    shown.push({ beat: bi, text: s })
    spoken.push(...speechSentences(speech.text, 0))
  }
})
if (spoken.length !== shown.length) throw new Error('every sentence must be one spoken sentence')

const tts = await hub.enqueue('tts', { sentences: spoken, lengthScale: 0.9 } satisfies TtsPayload)
const images = await Promise.all(
  spec.beats.map((b, i) => hub.enqueue('image', { prompt: `${b.imagePrompt}, ${spec.imageStyle}`, width: 512, height: 512, quality: 'good', seed: 11 + i })),
)

const voice = await hub.waitFor(tts, 30 * 60_000, 3000)
if (voice?.status !== 'done') throw new Error(`voice failed: ${voice?.error}`)
writeFileSync(path.join(outDir, 'voice.wav'), hub.readFile(voice)!)
const sentenceMs = (voice.meta as { sentenceMs: number[] }).sentenceMs

const input: NarratedInput = {
  title: spec.title,
  titleUr: spec.titleUr,
  cta: spec.cta,
  music: spec.music,
  audio: 'voice.wav',
  beats: await Promise.all(
    spec.beats.map(async (b, i) => {
      const job = await hub.waitFor(images[i]!, 90 * 60_000, 5000)
      if (job?.status !== 'done') throw new Error(`image ${i + 1} failed: ${job?.error}`)
      const file = `beat${i + 1}.png`
      writeFileSync(path.join(outDir, file), hub.readFile(job)!)
      return {
        image: file,
        credit: b.credit,
        kicker: b.kicker,
        sentences: shown.flatMap((s, si) => (s.beat === i ? [{ text: s.text, ms: sentenceMs[si]! }] : [])),
      }
    }),
  ),
}
const timeline = composeNarrated(input)
writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify(timeline, null, 2))
console.log('timeline ready:', Math.round(timeline.totalFrames / 30), 's,', timeline.beats.length, 'beats')

if (process.argv.includes('--render')) {
  const root = path.resolve(import.meta.dirname, '../../../packages/video')
  const assets = path.join(outDir, 'assets')
  mkdirSync(assets, { recursive: true })
  for (const f of ['voice.wav', ...input.beats.map((b) => b.image)]) writeFileSync(path.join(assets, f), readFileSync(path.join(outDir, f)))
  const r = await renderNarrated({ timeline, outDir, assetsDir: assets, bundleDir: path.join(root, 'build/bundle'), browserExecutable: process.env.VIDEO_BROWSER_EXECUTABLE ?? null, onProgress: (p) => console.log('render', Math.round(p * 100) + '%') })
  console.log('rendered', r.mp4, r.qa.pass ? 'QA pass' : 'QA FAIL', JSON.stringify(r.qa.checks))
}
process.exit(0)
