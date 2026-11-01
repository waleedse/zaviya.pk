import { describe, expect, it } from 'vitest'
import { chatJson, EmptyModelReplyError, parseModelJson } from './json-tolerant.js'

describe('parseModelJson', () => {
  it('parses plain and fenced JSON', () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 })
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('ignores trailing prose that contains braces', () => {
    expect(parseModelJson('{"a":"x}y","b":{"c":2}}\nNote: I used {braces} here.')).toEqual({ a: 'x}y', b: { c: 2 } })
  })
  it('takes the first of two objects', () => {
    expect(parseModelJson('{"a":1}\n{"a":2}')).toEqual({ a: 1 })
  })
  it('ignores leading prose and escaped quotes', () => {
    expect(parseModelJson('Here you go: {"a":"say \\"hi\\" }"} thanks')).toEqual({ a: 'say "hi" }' })
  })
  it('throws when there is no object', () => {
    expect(() => parseModelJson('no json')).toThrow()
  })
})

describe('chatJson (ZAV-280)', () => {
  it('retries once after an empty reply', async () => {
    const replies = ['', '{"a":1}']
    const seen: string[] = []
    const out = await chatJson(async () => ({ content: replies.shift()! }), 'qa', (i) => seen.push(i.reason))
    expect(out).toEqual({ a: 1 })
    expect(seen).toEqual(['empty'])
  })
  it('throws a labelled error when the reply stays empty', async () => {
    let calls = 0
    await expect(chatJson(async () => (calls++, { content: '  ' }), 'qa')).rejects.toBeInstanceOf(EmptyModelReplyError)
    expect(calls).toBe(2)
  })
  it('throws a labelled error for prose with no JSON', async () => {
    await expect(chatJson(async () => ({ content: 'sorry, cannot' }), 'seo-plan')).rejects.toThrow(/seo-plan: model reply is not valid JSON/)
  })
})
