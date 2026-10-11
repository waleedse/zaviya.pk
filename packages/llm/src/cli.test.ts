import { describe, expect, it } from 'vitest'
import { CliProvider, extractJson, parseCliJson, parseResetAt } from './cli.js'

describe('cli helpers', () => {
  it('reads the result object from CLI output with log lines around it', () => {
    const out = 'warming up\n{"type":"result","subtype":"success","is_error":false,"result":"hello"}\n'
    expect(parseCliJson(out)?.result).toBe('hello')
  })

  it('extracts JSON from fenced or chatty replies', () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(extractJson('here: {"a":{"b":2}} done')).toBe('{"a":{"b":2}}')
  })

  it('parses reset times from limit messages', () => {
    expect(parseResetAt('Claude AI usage limit reached|1791740000')).toBe(1791740000_000)
    expect(parseResetAt('resets at 2026-10-11T20:00:00Z')).toBe(Date.parse('2026-10-11T20:00:00Z'))
    expect(parseResetAt('try later')).toBeNull()
  })

  it('rests once the local 5-hour call budget is spent', async () => {
    const p = new CliProvider({ kind: 'claude', bin: 'false', maxCallsPer5h: 1 })
    await expect(p.chat({ model: 'haiku', messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow()
    expect(p.isResting()).toBe(true)
  })

  it('fails cleanly when the CLI exits before reading a large prompt', async () => {
    const p = new CliProvider({ kind: 'claude', bin: 'false' })
    const content = 'x'.repeat(2_000_000)
    await expect(p.chat({ model: 'haiku', messages: [{ role: 'user', content }] })).rejects.toThrow(/failed \(exit 1\)/)
  })
})
