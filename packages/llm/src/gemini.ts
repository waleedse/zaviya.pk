import type { ChatResult, LLMProvider, Msg, ToolCall, ToolDef } from './types.js'
import { DEFAULT_GEMINI_EMBED_MODEL, DEFAULT_GEMINI_MODEL } from './types.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

function toGeminiContents(messages: Msg[]) {
  const contents: { role: string; parts: unknown[] }[] = []
  for (const m of messages) {
    if (m.role === 'system') {
      contents.push({ role: 'user', parts: [{ text: `[system]\n${m.content}` }] })
      contents.push({ role: 'model', parts: [{ text: 'Understood.' }] })
      continue
    }
    if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: m.toolCallId ?? 'tool',
              response: { result: m.content },
            },
          },
        ],
      })
      continue
    }
    const role = m.role === 'assistant' ? 'model' : 'user'
    const parts: unknown[] = []
    if (m.content) parts.push({ text: m.content })
    if (m.toolCalls?.length) {
      for (const tc of m.toolCalls) {
        parts.push({
          functionCall: { name: tc.name, args: tc.arguments },
        })
      }
    }
    contents.push({ role, parts })
  }
  return contents
}

function toFunctionDeclarations(tools?: ToolDef[]) {
  if (!tools?.length) return undefined
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))
}

function parseGeminiToolCalls(parts: unknown[]): ToolCall[] {
  const calls: ToolCall[] = []
  for (const p of parts) {
    const fc = (p as { functionCall?: { name?: string; args?: Record<string, unknown> } }).functionCall
    if (fc?.name) {
      calls.push({
        id: `gemini_${fc.name}_${calls.length}`,
        name: fc.name,
        arguments: fc.args ?? {},
      })
    }
  }
  return calls
}

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini'

  constructor(
    private readonly apiKey: string,
    private readonly defaultChatModel = DEFAULT_GEMINI_MODEL,
    private readonly defaultEmbedModel = DEFAULT_GEMINI_EMBED_MODEL,
  ) {}

  async health(): Promise<boolean> {
    if (!this.apiKey) return false
    try {
      const url = `${BASE}/models/${this.defaultChatModel}?key=${encodeURIComponent(this.apiKey)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      return res.ok
    } catch {
      return false
    }
  }

  async chat(opts: {
    model: string
    messages: Msg[]
    tools?: ToolDef[]
    format?: Record<string, unknown>
    temperature?: number
    maxTokens?: number
    signal?: AbortSignal
  }): Promise<ChatResult> {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY not configured')

    const model = opts.model.startsWith('gemini') ? opts.model : this.defaultChatModel
    const generationConfig: Record<string, unknown> = {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.maxTokens ?? 4096,
    }
    if (opts.format) {
      generationConfig.responseMimeType = 'application/json'
      generationConfig.responseSchema = opts.format
    }

    const body: Record<string, unknown> = {
      contents: toGeminiContents(opts.messages),
      generationConfig,
    }
    const decls = toFunctionDeclarations(opts.tools)
    if (decls) body.tools = [{ functionDeclarations: decls }]

    const url = `${BASE}/models/${model}:generateContent?key=${encodeURIComponent(this.apiKey)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Gemini chat failed (${res.status}): ${text}`)
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: unknown[] } }[]
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
    }
    const parts = data.candidates?.[0]?.content?.parts ?? []
    let content = ''
    for (const p of parts) {
      const text = (p as { text?: string }).text
      if (text) content += text
    }
    const toolCalls = parseGeminiToolCalls(parts)
    const um = data.usageMetadata
    return {
      content,
      toolCalls,
      usage: um
        ? {
            promptTokens: um.promptTokenCount,
            completionTokens: um.candidatesTokenCount,
            totalTokens: um.totalTokenCount,
          }
        : undefined,
      model,
      provider: this.id,
    }
  }

  async embed(model: string, input: string[]): Promise<number[][]> {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY not configured')
    const embedModel = model.startsWith('gemini') ? model : this.defaultEmbedModel

    if (input.length === 1) {
      const url = `${BASE}/models/${embedModel}:embedContent?key=${encodeURIComponent(this.apiKey)}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${embedModel}`,
          content: { parts: [{ text: input[0] }] },
          outputDimensionality: 768,
        }),
      })
      if (!res.ok) throw new Error(`Gemini embed failed (${res.status})`)
      const data = (await res.json()) as { embedding?: { values?: number[] } }
      const vec = data.embedding?.values
      if (!vec) throw new Error('Gemini embed: empty vector')
      return [vec]
    }

    const url = `${BASE}/models/${embedModel}:batchEmbedContents?key=${encodeURIComponent(this.apiKey)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: input.map((text) => ({
          model: `models/${embedModel}`,
          content: { parts: [{ text }] },
          outputDimensionality: 768,
        })),
      }),
    })
    if (!res.ok) throw new Error(`Gemini batch embed failed (${res.status})`)
    const data = (await res.json()) as { embeddings?: { values?: number[] }[] }
    return (data.embeddings ?? []).map((e) => {
      if (!e.values) throw new Error('Gemini embed: empty vector')
      return e.values
    })
  }
}
