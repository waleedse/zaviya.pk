import { describe, expect, it } from 'vitest'
import { FPS } from './constants'
import { captionChunks, composeNarrated, NARRATED_END_FRAMES, NARRATED_LEAD_IN_FRAMES } from './narrated'

const beat = (ms: number[], text = 'یہ ایک چھوٹی سی مثال ہے جو کیپشن بناتی ہے') => ({
  image: 'a.png',
  sentences: ms.map((m) => ({ text, ms: m })),
})

describe('composeNarrated', () => {
  it('times every beat from the audio, back to back after the lead-in', () => {
    const t = composeNarrated({ title: 'T', titleUr: 'ٹی', beats: [beat([3000, 2000]), beat([4000])], audio: 'v.wav', cta: 'c' })
    expect(t.beats[0]!.from).toBe(NARRATED_LEAD_IN_FRAMES)
    expect(t.beats[0]!.durationInFrames).toBe(5 * FPS)
    expect(t.beats[1]!.from).toBe(NARRATED_LEAD_IN_FRAMES + 5 * FPS)
    expect(t.endFrom).toBe(NARRATED_LEAD_IN_FRAMES + 9 * FPS)
    expect(t.totalFrames).toBe(t.endFrom + NARRATED_END_FRAMES)
    expect(t.beats.map((b) => b.drift)).toEqual([0, 1])
  })

  it('keeps captions inside their beat and in order', () => {
    const t = composeNarrated({ title: 'T', titleUr: 'ٹی', beats: [beat([3000, 2000])], audio: 'v.wav', cta: 'c' })
    const b = t.beats[0]!
    let prev = b.from
    for (const c of b.chunks) {
      expect(c.from).toBeGreaterThanOrEqual(prev)
      expect(c.to).toBeLessThanOrEqual(b.from + b.durationInFrames)
      prev = c.from
    }
  })

  it('refuses a video that is too long or empty', () => {
    expect(() => composeNarrated({ title: 'T', titleUr: 'ٹی', beats: [beat([95_000])], audio: 'v.wav', cta: 'c' })).toThrow(/shorten/)
    expect(() => composeNarrated({ title: 'T', titleUr: 'ٹی', beats: [], audio: 'v.wav', cta: 'c' })).toThrow()
  })
})

describe('captionChunks', () => {
  it('groups three words and never leaves a single last word', () => {
    expect(captionChunks('ایک دو تین چار پانچ', 0, 90).map((c) => c.text)).toEqual(['ایک دو تین', 'چار پانچ'])
    expect(captionChunks('ایک دو تین چار', 0, 90).map((c) => c.text)).toEqual(['ایک دو تین چار'])
    expect(captionChunks('', 0, 90)).toEqual([])
  })
})
