import { describe, expect, it, vi } from 'vitest'
import type { LLMRouter } from '@zaviya/llm'
import { runQaChecks } from './qa.js'
import type { WriteResult } from './write.js'

const write = {
  en: { title: 'Govt cuts petrol price by Rs5', dek: 'New rates from midnight.', bodyMarkdown: 'The government cut petrol prices on Sunday. '.repeat(30) },
} as unknown as WriteResult

const routerWith = (contents: string[]) => {
  const chat = vi.fn(async () => ({ content: contents.shift() ?? '', model: 'm', provider: 'p', toolCalls: [] }))
  return { router: { chat } as unknown as LLMRouter, chat }
}

describe('runQaChecks LLM step (ZAV-280)', () => {
  it('an empty reply is retried once and then used', async () => {
    const { router, chat } = routerWith(['', JSON.stringify({ unsupportedClaims: [], styleIssues: [], pass: true })])
    const res = await runQaChecks(write, ['The government cut petrol prices on Sunday.'], 'normal', router)
    expect(chat).toHaveBeenCalledTimes(2)
    expect(res.llmSkipped).toBeUndefined()
  })
  it('two empty replies mark the model step as skipped with a reason', async () => {
    const { router, chat } = routerWith(['', ''])
    const res = await runQaChecks(write, ['x'], 'normal', router)
    expect(chat).toHaveBeenCalledTimes(2)
    expect(res.llmSkipped).toBe('empty_reply')
  })
  it('prose instead of JSON is reported as bad_json', async () => {
    const { router } = routerWith(['Sorry, I cannot', 'still prose'])
    const res = await runQaChecks(write, ['x'], 'normal', router)
    expect(res.llmSkipped).toBe('bad_json')
  })
})
