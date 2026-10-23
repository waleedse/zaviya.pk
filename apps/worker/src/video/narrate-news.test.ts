import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MediaHub, memoryHubStore } from './media-hub.js'
import { narrateEdition } from './narrate-news.js'
import type { StoryInput, Timeline } from './lib.js'

const story = (id: number): StoryInput => ({ id, slug: `s${id}`, title: `T${id}`, category: 'business', image: `${id}.jpg`, sources: [], isBreaking: false, priority: 'normal', publishedAt: '2026-10-24T00:00:00Z' })
const timeline = { track: { file: 'audio/calm.wav' }, theme: 'sunrise' } as unknown as Timeline

function env(headlines: Record<number, string>, agentSeen: boolean) {
  const dir = mkdtempSync(path.join(tmpdir(), 'narr-'))
  const imagesDir = path.join(dir, 'images')
  mkdirSync(imagesDir)
  for (const id of [1, 2, 3, 4]) writeFileSync(path.join(imagesDir, `${id}.jpg`), 'img')
  let t = 1_000_000
  const hub = new MediaHub(memoryHubStore(), dir, () => t)
  const redis = { get: async (k: string) => (headlines[Number(k.split(':')[2])] ? JSON.stringify({ headlineUr: headlines[Number(k.split(':')[2])] }) : null) }
  const markSeen = agentSeen ? hub.markAgentSeen() : Promise.resolve()
  // a stand-in agent: answers the voice job at once
  const agent = setInterval(async () => {
    const job = await hub.claim(['tts'], 'test')
    if (job) await hub.complete(job.id, Buffer.from('RIFF'), 'audio/wav', { sentenceMs: (job.payload as { sentences: string[] }).sentences.map(() => 3000) })
  }, 20)
  return { dir, imagesDir, hub, redis, markSeen, stop: () => clearInterval(agent), tick: () => (t += 1) }
}

describe('narrateEdition', () => {
  it('builds a narrated timeline from the Urdu headlines', async () => {
    const e = env({ 1: 'پیٹرول پانچ روپے سستا', 2: 'اسٹیٹ بینک نے شرح سود برقرار رکھی', 3: 'کرکٹ ٹیم فائنل میں پہنچ گئی', 4: 'IMF کا نیا قرض' }, true)
    await e.markSeen
    const r = await narrateEdition({ hub: e.hub, redis: e.redis, now: () => 1_000_000 }, { stories: [1, 2, 3, 4].map(story), timeline, imagesDir: e.imagesDir, outDir: e.dir, edition: 'morning' })
    e.stop()
    expect(r).not.toBeNull()
    // intro beat + four stories; the outro is spoken over the last one
    expect(r!.timeline.beats).toHaveLength(5)
    expect(r!.timeline.beats[1]!.kicker).toBeTruthy()
    expect(r!.timeline.beats[4]!.chunks.length).toBeGreaterThan(0)
    expect(r!.timeline.music).toBe('audio/calm.wav')
  })

  it('does nothing when the agent is offline or too few headlines exist', async () => {
    const off = env({ 1: 'ایک', 2: 'دو', 3: 'تین' }, false)
    expect(await narrateEdition({ hub: off.hub, redis: off.redis, now: () => 1_000_000 }, { stories: [1, 2, 3].map(story), timeline, imagesDir: off.imagesDir, outDir: off.dir, edition: 'evening' })).toBeNull()
    off.stop()

    const few = env({ 1: 'پیٹرول سستا', 2: 'Blorptastic headline' }, true)
    await few.markSeen
    expect(await narrateEdition({ hub: few.hub, redis: few.redis, now: () => 1_000_000 }, { stories: [1, 2, 3].map(story), timeline, imagesDir: few.imagesDir, outDir: few.dir, edition: 'morning' })).toBeNull()
    few.stop()
  })
})
