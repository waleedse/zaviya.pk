import { describe, expect, it, vi } from 'vitest'
import { applyConfidenceGate, validateReply } from './schema.js'
import { findConfirmCode, keywordParse, ModelUnavailable, understandWithModel } from './understand.js'

const slots = ['morning', 'money', 'ai', 'evening']
const reply = (actions: unknown[], s = 'ok') => JSON.stringify({ actions, reply_summary: s })

describe('schema', () => {
  it('accepts a valid reply and keeps args typed', () => {
    const u = validateReply({ actions: [{ type: 'set_cap', args: { platform: 'x', perDay: 6 }, confidence: 0.9 }], reply_summary: 's' })
    expect(u.actions[0]).toMatchObject({ type: 'set_cap', args: { platform: 'x', perDay: 6 } })
  })
  it('turns bad args into unknown instead of guessing', () => {
    const u = validateReply({
      actions: [
        { type: 'set_cap', args: { platform: 'x', perDay: 500 }, confidence: 0.95 },
        { type: 'set_cap', args: { platform: 'tiktok', perDay: 5 }, confidence: 0.95 },
        { type: 'retract', args: {}, confidence: 0.95 },
        { type: 'handoff', args: { agent: 'ceo', title: 'abc' }, confidence: 0.95 },
      ],
    })
    expect(u.actions.map((a) => a.type)).toEqual(['unknown', 'unknown', 'unknown', 'unknown'])
  })
  it('rejects a reply that is not the schema', () => {
    expect(() => validateReply({ nope: 1 })).toThrow()
    expect(() => validateReply({ actions: [{ type: 'rm_rf', args: {}, confidence: 1 }] })).toThrow()
  })
  it('confidence gate: risky actions below 0.7 are held, read-only ones still run', () => {
    const { run, held } = applyConfidenceGate([
      { type: 'pause', args: {}, confidence: 0.69 },
      { type: 'status', args: {}, confidence: 0.5 },
      { type: 'resume', args: {}, confidence: 0.7 },
    ])
    expect(held.map((a) => a.type)).toEqual(['pause'])
    expect(run.map((a) => a.type)).toEqual(['status', 'resume'])
  })
})

describe('understandWithModel', () => {
  it('asks at temperature 0 with a schema and parses the reply', async () => {
    const chat = vi.fn().mockResolvedValue({ content: reply([{ type: 'status', args: {}, confidence: 0.99 }]), toolCalls: [] })
    const u = await understandWithModel({ chat } as never, { subject: 's', text: 'status' }, slots)
    expect(u.actions[0]!.type).toBe('status')
    expect(chat.mock.calls[0]![1]).toMatchObject({ temperature: 0 })
    expect(chat.mock.calls[0]![1].format).toBeTruthy()
  })
  it('quota exhaustion and bad JSON both become ModelUnavailable', async () => {
    const quota = Object.assign(new Error('q'), { name: 'QuotaExhaustedError', resetAt: 1 })
    await expect(understandWithModel({ chat: vi.fn().mockRejectedValue(quota) } as never, { subject: '', text: 'x' }, slots)).rejects.toMatchObject({ quota: true })
    await expect(understandWithModel({ chat: vi.fn().mockResolvedValue({ content: 'not json' }) } as never, { subject: '', text: 'x' }, slots)).rejects.toBeInstanceOf(ModelUnavailable)
  })
})

describe('keywordParse (model down)', () => {
  const k = (text: string, subject = '') => keywordParse({ text, subject }, slots)
  it('knows the core commands', () => {
    expect(k('status')?.actions[0]!.type).toBe('status')
    expect(k('Pause.')?.actions[0]!.type).toBe('pause')
    expect(k('please resume')?.actions[0]!.type).toBe('resume')
    expect(k('video now morning')?.actions[0]).toMatchObject({ type: 'video_now', args: { slot: 'morning' } })
    expect(k('skip evening')?.actions[0]).toMatchObject({ type: 'video_skip', args: { slot: 'evening' } })
    expect(k('', 'STATUS')?.actions[0]!.type).toBe('status')
  })
  it('does not guess: unknown slot or prose gives null', () => {
    expect(k('video now midnight')).toBeNull()
    expect(k('please could you make the site faster')).toBeNull()
    expect(k('retract https://zaviya.pk/en/x')).toBeNull()
  })
})

describe('findConfirmCode', () => {
  it('finds the code case-insensitively', () => {
    expect(findConfirmCode('CONFIRM abc234')).toBe('ABC234')
    expect(findConfirmCode('yes\nconfirm: K7K7K7')).toBe('K7K7K7')
    expect(findConfirmCode('confirm')).toBeNull()
  })
})
