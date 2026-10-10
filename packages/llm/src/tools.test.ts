import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { runToolLoop } from './tools.js'
import type { LLMProvider, ChatResult, ToolDef } from './types.js'

const Out = z.object({ answer: z.string() })

function mockProvider(steps: ChatResult[]): LLMProvider {
  let i = 0
  return {
    id: 'mock',
    health: async () => true,
    embed: async () => [],
    chat: async () => steps[Math.min(i++, steps.length - 1)]!,
  }
}

describe('runToolLoop', () => {
  it('executes tools then validates JSON', async () => {
    const handler = vi.fn().mockResolvedValue({ hits: 1 })
    const tools: ToolDef[] = [
      {
        name: 'search',
        description: 'search',
        parameters: { type: 'object', properties: {} },
        handler,
      },
    ]
    const provider = mockProvider([
      {
        content: '',
        toolCalls: [{ id: '1', name: 'search', arguments: { q: 'x' } }],
        model: 'm',
        provider: 'mock',
      },
      { content: '{"answer":"done"}', toolCalls: [], model: 'm', provider: 'mock' },
    ])
    const res = await runToolLoop(provider, {
      model: 'm',
      messages: [{ role: 'user', content: 'go' }],
      tools,
      outputSchema: Out,
    })
    expect(handler).toHaveBeenCalled()
    expect(res.parsed.answer).toBe('done')
  })

  it('repairs invalid JSON once', async () => {
    const provider = mockProvider([
      { content: 'not json', toolCalls: [], model: 'm', provider: 'mock' },
      { content: '{"answer":"fixed"}', toolCalls: [], model: 'm', provider: 'mock' },
    ])
    const res = await runToolLoop(provider, {
      model: 'm',
      messages: [{ role: 'user', content: 'go' }],
      tools: [],
      outputSchema: Out,
    })
    expect(res.parsed.answer).toBe('fixed')
  })
})
