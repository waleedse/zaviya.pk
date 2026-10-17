export type JSONSchema = Record<string, unknown>

export type MsgRole = 'system' | 'user' | 'assistant' | 'tool'

export interface Msg {
  role: MsgRole
  content: string
  /** Ollama/Gemini tool call id when role is tool */
  toolCallId?: string
  /** When assistant message includes tool calls */
  toolCalls?: ToolCall[]
  /** Gemini Interactions API: lets the next call continue this turn statefully */
  interactionId?: string
  /** Inline images (base64) sent with a user message; only the Gemini provider reads them */
  images?: { mimeType: string; base64: string }[]
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolDef {
  name: string
  description: string
  parameters: JSONSchema
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown
}

export interface TokenUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export interface ChatResult {
  content: string
  toolCalls: ToolCall[]
  usage?: TokenUsage
  /** Gemini Interactions API id of this turn */
  interactionId?: string
  model: string
  provider: string
}

export interface LLMProvider {
  id: string
  chat(opts: {
    model: string
    messages: Msg[]
    tools?: ToolDef[]
    format?: JSONSchema
    temperature?: number
    maxTokens?: number
    signal?: AbortSignal
  }): Promise<ChatResult>
  embed(model: string, input: string[]): Promise<number[][]>
  health(): Promise<boolean>
}

export type LLMTask = 'triage' | 'write_en' | 'write_ur' | 'qa' | 'embed' | 'social' | 'seo' | 'vision'

/** Writing models: best first. Each model has its own free-tier quota, so the chain rotates when one runs out. */
export const GEMINI_WRITER_CHAIN = 'gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview'
/** Cheap models for scoring, keyword research and QA. */
export const GEMINI_LITE_CHAIN = 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest,gemma-4-26b-a4b-it'

/** Models that read screenshots (the extension's "eyes"): free-tier Gemini only, never a local or paid fallback. */
export const GEMINI_VISION_CHAIN = 'gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite'

/**
 * Free hybrid: short JSON jobs run on the local model; the free Gemini quota is saved for
 * writing, and writing itself falls back to the local model when that quota runs out.
 */
export const DEFAULT_ACTIVE_MODELS: Record<LLMTask, string> = {
  triage: 'ollama:qwen3:8b',
  write_en: `gemini:${GEMINI_WRITER_CHAIN}`,
  write_ur: `gemini:${GEMINI_WRITER_CHAIN}`,
  qa: 'ollama:qwen3:8b',
  embed: 'ollama:nomic-embed-text',
  social: 'ollama:qwen3:8b',
  seo: 'ollama:qwen3:8b',
  vision: `gemini:${GEMINI_VISION_CHAIN}`,
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
export const DEFAULT_GEMINI_EMBED_MODEL = 'gemini-embedding-001'
