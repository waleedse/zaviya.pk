/** Local end-to-end check of the media hub with the Mac agent: pnpm tsx scripts/hub-dev.ts (agent: HUB_URL=http://127.0.0.1:8790 MEDIA_AGENT_TOKEN=dev). */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { MediaHub, memoryHubStore, startMediaHubServer } from '../src/video/media-hub.js'
import { speechSentences, toSpeechText } from '../src/video/urdu-speech.js'

const dir = mkdtempSync(path.join(tmpdir(), 'hub-dev-'))
const hub = new MediaHub(memoryHubStore(), dir)
startMediaHubServer(hub, { port: 8790, token: 'dev', host: '127.0.0.1' })

const text = toSpeechText('حکومت نے پیٹرول کی قیمت میں Rs5.40 فی لیٹر کمی کا اعلان کر دیا ہے۔ نئی قیمت جمعے سے لاگو ہوگی۔').text
const t = await hub.enqueue('tts', { sentences: speechSentences(text), lengthScale: 0.9 })
const i = await hub.enqueue('image', { prompt: 'a calm illustration of a smartphone showing a warning shield, flat vector style, no text', width: 512, height: 512, quality: 'fast' })
console.log('spoken text:', text)
for (const [name, id] of [['tts', t], ['image', i]] as const) {
  const job = await hub.waitFor(id, 15 * 60_000, 2000)
  console.log(name, job?.status, JSON.stringify(job?.meta), job?.error ?? '')
  if (job?.status === 'done') writeFileSync(path.join(process.argv[2] ?? '.', `hubdev-${name}.${name === 'tts' ? 'wav' : 'png'}`), hub.readFile(job)!)
}
process.exit(0)
