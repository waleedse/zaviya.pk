import { describe, expect, it } from 'vitest'
import { scriptIssues, writeExplainerScript, type ExplainerScript } from './script.js'
import type { Idea } from './ideas.js'

const beat = (text: string, imagePrompt = 'a smartphone and a shield symbol on a plain background') => ({ kicker: 'پہلی بات', text, imagePrompt })
const good = (): ExplainerScript => ({
  title: 'How to avoid bank scams',
  titleUr: 'بینک کے دھوکے سے کیسے بچیں',
  beats: [
    beat('کیا آپ کو کبھی ایسا پیغام ملا ہے کہ اکاؤنٹ بند ہونے والا ہے؟'),
    beat('یہ ٹھگوں کا پرانا طریقہ ہے۔ وہ بینک بن کر پیغام بھیجتے ہیں، اور جلدی میں ڈال دیتے ہیں۔'),
    beat('کسی کو اپنا او ٹی پی کبھی نہ بتائیں۔ اصل بینک یہ کوڈ فون پر نہیں مانگتا اور نہ پیغام میں مانگتا ہے۔'),
    beat('پیغام میں آئے ہوئے لنک پر کلک نہ کریں۔ ایپ یا ویب سائٹ خود کھول کر دیکھیں اور ہر بات کی تصدیق کریں۔'),
    beat('اگر شک ہو تو کال کاٹ دیں۔ بینک کی اپنی ہیلپ لائن پر خود فون کریں، جو آپ کے کارڈ پر لکھی ہوتی ہے۔'),
    beat('دھوکا ہو جائے تو فوراً بینک کو بتائیں اور اکاؤنٹ بلاک کروائیں۔ ایسی مزید کام کی باتیں زاویہ ڈاٹ پی کے پر دیکھیں۔'),
  ],
  caption: 'چار آسان عادتیں جو آپ کو دھوکے سے بچا سکتی ہیں۔',
  hashtags: ['Scam', 'Cybersecurity', 'Banking'],
  facts: [{ claim: 'banks do not ask for OTP', source: 'general knowledge' }],
  risk: 'low',
})

describe('scriptIssues', () => {
  it('accepts a good evergreen script', () => {
    expect(scriptIssues(good(), '', true)).toEqual([])
  })

  it('catches greetings, English words, long scripts, bad picture briefs and invented figures', () => {
    const s = good()
    s.beats[0]!.text = 'السلام علیکم! کیا آپ کو Blorptastic پیغام ملا ہے؟'
    s.beats[1]!.imagePrompt = 'a portrait with a logo and text on the wall'
    s.beats[2]!.text = 'ہر سال 7500 لوگ دھوکا کھاتے ہیں۔'
    const issues = scriptIssues(s, '', true).join(' | ')
    expect(issues).toMatch(/greeting/)
    expect(issues).toMatch(/Blorptastic/)
    expect(issues).toMatch(/picture brief/)
    expect(issues).toMatch(/7500/)
  })

  it('allows a figure that the sources state', () => {
    const s = good()
    s.beats[2]!.text = 'ہر سال 7500 لوگ دھوکا کھاتے ہیں۔ اصل بینک یہ کوڈ فون پر نہیں مانگتا اور نہ پیغام میں مانگتا ہے۔'
    expect(scriptIssues(s, 'In 2025 7,500 people reported it', false)).toEqual([])
  })
})

describe('writeExplainerScript', () => {
  const idea: Idea = { id: 'a', title: 'How to avoid bank scams', angle: 'x', origin: 'evergreen', sources: [], tags: [], baseScore: 1, createdAt: 0, risk: 'low', status: 'backlog' }

  it('asks again with the problems and returns the first script that passes', async () => {
    const bad = good()
    bad.beats[0]!.text = 'السلام علیکم! یہ ایک مثال ہے؟'
    const answers = [JSON.stringify(bad), JSON.stringify(good())]
    let calls = 0
    const router = { chat: async (_t: string, opts: { messages: { content: string }[] }) => {
      calls++
      if (calls === 2) expect(opts.messages.at(-1)!.content).toMatch(/greeting/)
      return { content: answers.shift()!, provider: 'test', model: 'm' }
    } }
    const r = await writeExplainerScript({ router: router as never }, idea)
    expect(calls).toBe(2)
    expect(r.script.beats).toHaveLength(6)
  })

  it('gives up after three failed tries', async () => {
    const router = { chat: async () => ({ content: '{"nope":1}', provider: 'test', model: 'm' }) }
    await expect(writeExplainerScript({ router: router as never }, idea)).rejects.toThrow(/did not pass/)
  })

  it('fails when sources exist but none can be read', async () => {
    await expect(writeExplainerScript({ router: {} as never, fetchText: async () => null }, { ...idea, sources: ['https://x.test/a'] })).rejects.toThrow(/sources/)
  })
})
