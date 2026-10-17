import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GeminiProvider, cleanSchema, toInteractionInput } from './gemini.js'

const interaction = (steps: unknown[], id = 'int_1') =>
  new Response(JSON.stringify({ id, status: 'completed', steps }), { status: 200 })

describe('GeminiProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns false health without api key', async () => {
    const p = new GeminiProvider('')
    await expect(p.health()).resolves.toBe(false)
  })

  it('chat parses model_output text and sends steps to the Interactions API', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      interaction([{ type: 'thought' }, { type: 'model_output', content: [{ type: 'text', text: '{"ok":true}' }] }]),
    )
    const p = new GeminiProvider('key')
    const res = await p.chat({
      model: 'gemini-3.8-flash',
      messages: [
        { role: 'system', content: 'json only' },
        { role: 'user', content: 'hi' },
      ],
      format: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' } } },
    })
    expect(res.content).toBe('{"ok":true}')
    expect(res.provider).toBe('gemini')
    expect(res.interactionId).toBe('int_1')
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(String(url)).toContain('/interactions')
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.system_instruction).toBe('json only')
    expect(body.input).toEqual([{ type: 'user_input', content: [{ type: 'text', text: 'hi' }] }])
    expect(body.response_format).toEqual({ type: 'object', properties: { ok: { type: 'boolean' } } })
  })

  it('sends inline images as image content next to the text', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(interaction([{ type: 'model_output', content: [{ type: 'text', text: 'seen' }] }]))
    await new GeminiProvider('key').chat({
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'what is on screen?', images: [{ mimeType: 'image/jpeg', base64: 'QUJD' }] }],
    })
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body))
    expect(body.input).toEqual([
      {
        type: 'user_input',
        content: [
          { type: 'text', text: 'what is on screen?' },
          { type: 'image', data: 'QUJD', mime_type: 'image/jpeg' },
        ],
      },
    ])
  })

  it('parses function calls', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      interaction([{ type: 'function_call', id: 'call_1', name: 'get_rate', arguments: { series: 'gold' } }]),
    )
    const res = await new GeminiProvider('key').chat({ model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'x' }] })
    expect(res.toolCalls).toEqual([{ id: 'call_1', name: 'get_rate', arguments: { series: 'gold' } }])
  })

  it('retries on 429', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after': '1' } }))
      .mockResolvedValueOnce(interaction([{ type: 'model_output', content: [{ type: 'text', text: 'ok' }] }]))
    const pending = new GeminiProvider('key').chat({ model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'x' }] })
    await vi.advanceTimersByTimeAsync(1500)
    await expect(pending).resolves.toMatchObject({ content: 'ok' })
    vi.useRealTimers()
  })
})

describe('toInteractionInput', () => {
  it('continues statefully after an assistant tool-call turn', () => {
    const out = toInteractionInput([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'q' },
      { role: 'assistant', content: '', interactionId: 'prev', toolCalls: [{ id: 'c1', name: 'get_rate', arguments: {} }] },
      { role: 'tool', toolCallId: 'c1', content: '{"v":1}' },
    ])
    expect(out.previousInteractionId).toBe('prev')
    expect(out.systemInstruction).toBe('sys')
    expect(out.steps).toEqual([{ type: 'function_result', call_id: 'c1', name: 'get_rate', result: '{"v":1}' }])
  })

  it('cleanSchema strips unsupported keys deeply', () => {
    expect(cleanSchema({ $schema: 'x', type: 'object', additionalProperties: false, properties: { a: { type: 'array', items: { type: 'string', additionalProperties: false } } } })).toEqual({
      type: 'object',
      properties: { a: { type: 'array', items: { type: 'string' } } },
    })
  })
})

describe('model rotation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('moves to the next model when one is out of daily quota, then throws when all are', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after': '3000' } }))
      .mockResolvedValueOnce(interaction([{ type: 'model_output', content: [{ type: 'text', text: 'from-b' }] }]))
    const p = new GeminiProvider('key')
    const res = await p.chat({ model: 'gemini-rot-a,gemini-rot-b', messages: [{ role: 'user', content: 'x' }] })
    expect(res.content).toBe('from-b')
    expect(res.model).toBe('gemini-rot-b')
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[1]![1] as RequestInit).body))
    expect(body.model).toBe('gemini-rot-b')

    // gemini-rot-a is cooling down now; b fails too -> QuotaExhaustedError
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after': '3000' } }))
    await expect(p.chat({ model: 'gemini-rot-a,gemini-rot-b', messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({
      name: 'QuotaExhaustedError',
    })
  })
})

import { OpenAICompatProvider } from './openai-compat.js'
describe('OpenAICompatProvider', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())
  it('calls chat/completions with JSON mode and parses content', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }))
    const p = new OpenAICompatProvider('https://api.example.com/v1', 'k')
    const r = await p.chat({ model: 'qwen3.7-flash', messages: [{ role: 'user', content: 'x' }], format: { type: 'object' } })
    expect(r.content).toBe('{"ok":true}')
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(String(url)).toBe('https://api.example.com/v1/chat/completions')
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.model).toBe('qwen3.7-flash')
  })
})
