import { describe, expect, it } from 'vitest'
import { inboxPrompt, isFromAgent, newHumanComments, type LinearComment } from './inbox.js'

const c = (id: string, body: string, at: string): LinearComment => ({ id, body, createdAt: at, issue: { identifier: 'ZAV-20', title: 'Disk' } })

describe('inbox', () => {
  it('tells agent comments from Waleed', () => {
    expect(isFromAgent('Fixed it.\n\n— 🤖 Zaviya agent')).toBe(true)
    expect(isFromAgent('Merged #10 and released v2026.10.12-25.')).toBe(true)
    expect(isFromAgent('Editor, 20:10 PKT. Article 248 said ...')).toBe(true)
    expect(isFromAgent('[watchdog] Worker heartbeat stopped')).toBe(true)
    expect(isFromAgent('Ask engineer to fix this by deployment')).toBe(false)
    expect(isFromAgent('pm ye check kro')).toBe(false)
    expect(isFromAgent('PM ye check kro ke articles kyun ruk gaye')).toBe(false)
    expect(isFromAgent('PM: added pm-approved')).toBe(true)
  })

  it('returns new human comments oldest first and skips seen ones', () => {
    const list = [
      c('3', 'second ask', '2026-10-12T15:40:00Z'),
      c('1', 'Merged #10', '2026-10-12T15:22:00Z'),
      c('2', 'first ask', '2026-10-12T15:30:00Z'),
      c('4', 'already answered', '2026-10-12T15:35:00Z'),
    ]
    expect(newHumanComments(list, new Set(['4'])).map((x) => x.id)).toEqual(['2', '3'])
  })

  it('builds a prompt that quotes the comment and asks for a reply on the issue', () => {
    const p = inboxPrompt(c('9', 'har deployment par cleanup ho', '2026-10-12T15:30:00Z'))
    expect(p).toContain('har deployment par cleanup ho')
    expect(p).toContain('node ops/bin/linear.mjs comment ZAV-20')
  })
})
