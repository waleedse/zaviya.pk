import type { ChatResult, LLMProvider, Msg, ToolCall, ToolDef } from './types.js'
import { DEFAULT_GEMINI_EMBED_MODEL, DEFAULT_GEMINI_MODEL } from './types.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

type TextContent = { type: 'text'; text: string }
type ImageContent = { type: 'image'; data: string; mime_type: string }

type Step =
  | { type: 'user_input'; content: (TextContent | ImageContent)[] }
  | { type: 'model_output'; content: TextContent[] }
  | { type: 'function_result'; call_id: string; name: string; result: string }

interface InteractionResponse {
  id?: string
  status?: string
  steps?: {
    type: string
    content?: { type: string; text?: string }[]
    id?: string
    name?: string
    arguments?: Record<string, unknown>
  }[]
  usage?: { total_input_tokens?: number; total_output_tokens?: number; total_tokens?: number }
  error?: { message?: string; code?: string }
}

export type ThinkingLevel = 'low' | 'medium' | 'high'

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504])
/** Waits longer than this are treated as "quota used up" and we move to the next model. */
const MAX_INLINE_WAIT_MS = 20_000

/** Every model in the chain is out of quota; `resetAt` is when the first one frees up. */
export class QuotaExhaustedError extends Error {
  constructor(readonly resetAt: number) {
    super(`Gemini quota exhausted for all models until ${new Date(resetAt).toISOString()}`)
    this.name = 'QuotaExhaustedError'
  }
}

export function isQuotaExhausted(e: unknown): e is QuotaExhaustedError {
  return e instanceof Error && e.name === 'QuotaExhaustedError'
}

class RateLimited extends Error {
  constructor(readonly retryInMs: number) {
    super('rate limited')
  }
}

/** Per-model cool-down shared by every provider instance in the process. */
const cooldowns = new Map<string, number>()

export function geminiModelStatus(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [m, until] of cooldowns) if (until > Date.now()) out[m] = new Date(until).toISOString()
  return out
}

function text(t: string): TextContent[] {
  return [{ type: 'text', text: t }]
}

/**
 * Build Interactions API input. Function calls can only be continued statefully,
 * so when the history holds an assistant turn with an interactionId we send
 * `previous_interaction_id` plus only the messages that came after it.
 */
export function toInteractionInput(messages: Msg[]): {
  systemInstruction?: string
  previousInteractionId?: string
  steps: Step[]
} {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')

  let start = 0
  let previousInteractionId: string | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role === 'assistant' && m.interactionId) {
      previousInteractionId = m.interactionId
      start = i + 1
      break
    }
  }

  const callNames = new Map<string, string>()
  for (const m of messages) for (const tc of m.toolCalls ?? []) callNames.set(tc.id, tc.name)

  const steps: Step[] = []
  for (const m of messages.slice(start)) {
    if (m.role === 'system') continue
    if (m.role === 'tool') {
      const id = m.toolCallId ?? 'tool'
      steps.push({ type: 'function_result', call_id: id, name: callNames.get(id) ?? id, result: m.content })
    } else if (m.role === 'assistant') {
      if (m.content) steps.push({ type: 'model_output', content: text(m.content) })
    } else {
      const images: ImageContent[] = (m.images ?? []).map((im) => ({ type: 'image', data: im.base64, mime_type: im.mimeType }))
      steps.push({ type: 'user_input', content: [...text(m.content), ...images] })
    }
  }

  return { systemInstruction: system || undefined, previousInteractionId, steps }
}

function toTools(tools?: ToolDef[]) {
  if (!tools?.length) return undefined
  return tools.map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))
}

/** OpenAPI-3 schemas from zod-to-json-schema carry keys the API rejects. */
export function cleanSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(cleanSchema)
  if (!schema || typeof schema !== 'object') return schema
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === '$schema' || k === 'additionalProperties' || k === 'definitions' || k === '$ref') continue
    out[k] = cleanSchema(v)
  }
  return out
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(signal.reason)
    }, { once: true })
  })
}

/** "gemini-3.8-flash,gemini-3.7-flash" -> ['gemini-3.8-flash', 'gemini-3.7-flash'] */
export function modelChain(model: string, fallback: string): string[] {
  const list = model.split(',').map((m) => m.trim()).filter((m) => m.startsWith('gemini') || m.startsWith('gemma'))
  return list.length ? list : [fallback]
}

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini'

  constructor(
    private readonly apiKey: string,
    private readonly defaultChatModel = DEFAULT_GEMINI_MODEL,
    private readonly defaultEmbedModel = DEFAULT_GEMINI_EMBED_MODEL,
    private readonly thinkingLevel: ThinkingLevel = 'low',
  ) {}

  private headers() {
    return { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey }
  }

  private async post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    let attempt = 0
    for (;;) {
      const res = await fetch(`${BASE}/${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal,
      })
      if (!RETRY_STATUSES.has(res.status)) return res
      const retryAfter = Number(res.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** (attempt + 1)
      // Daily quota: don't sleep for an hour, let the caller try another model.
      if (res.status === 429 && waitMs > MAX_INLINE_WAIT_MS) throw new RateLimited(waitMs)
      if (attempt >= 2) {
        if (res.status === 429 || res.status === 503) throw new RateLimited(Math.max(waitMs, 60_000))
        return res
      }
      attempt++
      await sleep(Math.min(waitMs, MAX_INLINE_WAIT_MS), signal)
    }
  }

  async health(): Promise<boolean> {
    if (!this.apiKey) return false
    try {
      const res = await fetch(`${BASE}/models/${this.defaultChatModel}`, {
        headers: this.headers(),
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
    if (!this.apiKey) throw new Error('GEMINI_API_KEY not configured')

    const chain = modelChain(opts.model, this.defaultChatModel)
    const { systemInstruction, previousInteractionId, steps } = toInteractionInput(opts.messages)

    const generationConfig: Record<string, unknown> = {
      temperature: opts.temperature ?? 0.3,
      max_output_tokens: opts.maxTokens ?? 8192,
    }
    const baseBody: Record<string, unknown> = { input: steps, generation_config: generationConfig }
    if (systemInstruction) baseBody.system_instruction = systemInstruction
    if (opts.format) baseBody.response_format = cleanSchema(opts.format)
    const tools = toTools(opts.tools)
    if (tools) baseBody.tools = tools

    // A stateful continuation must stay on the model that started it.
    const candidates = previousInteractionId ? chain.slice(0, 1) : chain
    let earliestReset = Infinity
    let res: Response | null = null
    let data: InteractionResponse = {}
    let model = candidates[0]!
    for (const m of candidates) {
      const until = cooldowns.get(m) ?? 0
      if (until > Date.now()) {
        earliestReset = Math.min(earliestReset, until)
        continue
      }
      model = m
      const body: Record<string, unknown> = { ...baseBody, model: m }
      if (previousInteractionId) body.previous_interaction_id = previousInteractionId
      // Gemma models don't take a thinking level.
      if (m.startsWith('gemini')) generationConfig.thinking_level = this.thinkingLevel
      else delete generationConfig.thinking_level
      try {
        res = await this.post('interactions', body, opts.signal)
      } catch (e) {
        if (e instanceof RateLimited) {
          const resetAt = Date.now() + e.retryInMs
          cooldowns.set(m, resetAt)
          earliestReset = Math.min(earliestReset, resetAt)
          continue
        }
        throw e
      }
      data = (await res.json().catch(() => ({}))) as InteractionResponse
      break
    }
    if (!res) throw new QuotaExhaustedError(Number.isFinite(earliestReset) ? earliestReset : Date.now() + 3_600_000)
    if (!res.ok || data.error) {
      throw new Error(`Gemini chat failed (${model}, ${res.status}): ${data.error?.message ?? 'unknown error'}`)
    }

    let content = ''
    const toolCalls: ToolCall[] = []
    for (const s of data.steps ?? []) {
      if (s.type === 'model_output') {
        for (const c of s.content ?? []) if (c.type === 'text' && c.text) content += c.text
      } else if (s.type === 'function_call' && s.name) {
        toolCalls.push({ id: s.id ?? `${s.name}_${toolCalls.length}`, name: s.name, arguments: s.arguments ?? {} })
      }
    }

    const u = data.usage
    return {
      content,
      toolCalls,
      interactionId: data.id,
      usage: u
        ? { promptTokens: u.total_input_tokens, completionTokens: u.total_output_tokens, totalTokens: u.total_tokens }
        : undefined,
      model,
      provider: this.id,
    }
  }

  async embed(model: string, input: string[]): Promise<number[][]> {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY not configured')
    const embedModel = model.startsWith('gemini') ? model : this.defaultEmbedModel

    const res = await this.post(`models/${embedModel}:batchEmbedContents`, {
      requests: input.map((t) => ({
        model: `models/${embedModel}`,
        content: { parts: [{ text: t }] },
        outputDimensionality: 768,
      })),
    })
    if (!res.ok) throw new Error(`Gemini embed failed (${res.status})`)
    const data = (await res.json()) as { embeddings?: { values?: number[] }[] }
    return (data.embeddings ?? []).map((e) => {
      if (!e.values) throw new Error('Gemini embed: empty vector')
      return e.values
    })
  }
}
