import type { ChatResult, LLMProvider, Msg, ToolDef } from './types.js'

/**
 * Any OpenAI-compatible chat API: DeepSeek, Alibaba Qwen (Model Studio), OpenRouter, Groq, etc.
 * Configure with a base URL (…/v1) and key; model refs look like "api:qwen3.7-flash".
 */
export class OpenAICompatProvider implements LLMProvider {
  readonly id = 'api'

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly defaultModel = 'deepseek-flash',
  ) {}

  async health(): Promise<boolean> {
    if (!this.apiKey) return false
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(8000),
      })
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
    const model = opts.model || this.defaultModel
    const messages = opts.messages
      .filter((m) => m.role !== 'tool')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : m.role, content: m.content }))
    if (opts.format) {
      // json_object is the most widely supported structured mode; the schema rides along in the prompt.
      messages.push({
        role: 'system',
        content: `Respond with a single JSON object that matches this JSON Schema exactly:\n${JSON.stringify(opts.format)}`,
      })
    }
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 8192,
      ...(opts.format ? { response_format: { type: 'json_object' } } : {}),
      // OpenRouter: "thinking" models spend the whole budget reasoning; our JSON jobs don't need it.
      ...(this.baseUrl.includes('openrouter.ai') ? { reasoning: { enabled: false } } : {}),
    }
    let attempt = 0
    for (;;) {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal,
      })
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        attempt++
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt))
        continue
      }
      const data = (await res.json().catch(() => ({}))) as {
        choices?: { message?: { content?: string } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
        error?: { message?: string }
      }
      if (!res.ok) throw new Error(`API chat failed (${model}, ${res.status}): ${data.error?.message ?? 'unknown'}`)
      const content = data.choices?.[0]?.message?.content ?? ''
      // An empty answer (e.g. the model spent its budget "thinking") is a failure the router can fall back from.
      if (!content.trim()) throw new Error(`API chat returned empty content (${model})`)
      return {
        content,
        toolCalls: [],
        usage: data.usage
          ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens, totalTokens: data.usage.total_tokens }
          : undefined,
        model,
        provider: this.id,
      }
    }
  }

  async embed(): Promise<number[][]> {
    throw new Error('embeddings not supported on the generic API provider')
  }
}
