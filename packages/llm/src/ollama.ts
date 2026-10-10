import type { ChatResult, LLMProvider, Msg, ToolCall, ToolDef } from './types.js'

const DEFAULT_URL = 'http://127.0.0.1:11434'

function toOllamaMessages(messages: Msg[]) {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content }
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || '',
        tool_calls: m.toolCalls.map((tc) => ({
          function: { name: tc.name, arguments: tc.arguments },
        })),
      }
    }
    return { role: m.role, content: m.content }
  })
}

function toOllamaTools(tools?: ToolDef[]) {
  if (!tools?.length) return undefined
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

function parseToolCalls(raw: unknown): ToolCall[] {
  if (!raw || !Array.isArray(raw)) return []
  return raw.map((tc, i) => {
    const fn = (tc as { function?: { name?: string; arguments?: unknown } }).function
    let args: Record<string, unknown> = {}
    if (typeof fn?.arguments === 'string') {
      try {
        args = JSON.parse(fn.arguments) as Record<string, unknown>
      } catch {
        args = {}
      }
    } else if (fn?.arguments && typeof fn.arguments === 'object') {
      args = fn.arguments as Record<string, unknown>
    }
    return {
      id: `call_${i}_${fn?.name ?? 'tool'}`,
      name: fn?.name ?? 'unknown',
      arguments: args,
    }
  })
}

export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama'

  constructor(private readonly baseUrl = DEFAULT_URL) {}

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
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
    const body: Record<string, unknown> = {
      model: opts.model,
      stream: false,
      messages: toOllamaMessages(opts.messages),
      options: {
        temperature: opts.temperature ?? 0.3,
        num_ctx: 8192,
        num_predict: opts.maxTokens ?? 4096,
      },
    }
    if (opts.format) body.format = opts.format
    const tools = toOllamaTools(opts.tools)
    if (tools) body.tools = tools

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Ollama chat failed (${res.status}): ${text}`)
    }
    const data = (await res.json()) as {
      message?: { content?: string; tool_calls?: unknown[] }
      eval_count?: number
      prompt_eval_count?: number
    }
    const message = data.message ?? {}
    return {
      content: message.content ?? '',
      toolCalls: parseToolCalls(message.tool_calls),
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      model: opts.model,
      provider: this.id,
    }
  }

  async embed(model: string, input: string[]): Promise<number[][]> {
    const out: number[][] = []
    for (const text of input) {
      const res = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: text }),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(`Ollama embed failed (${res.status}): ${t}`)
      }
      const data = (await res.json()) as { embeddings?: number[][]; embedding?: number[] }
      const vec = data.embeddings?.[0] ?? data.embedding
      if (!vec) throw new Error('Ollama embed: empty vector')
      out.push(vec)
    }
    return out
  }
}
