export type JSONSchema = Record<string, unknown>

export type MsgRole = 'system' | 'user' | 'assistant' | 'tool'

export interface Msg {
  role: MsgRole
  content: string
  /** Ollama/Gemini tool call id when role is tool */
  toolCallId?: string
  /** When assistant message includes tool calls */
  toolCalls?: ToolCall[]
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

export type LLMTask = 'triage' | 'write_en' | 'write_ur' | 'qa' | 'embed' | 'social'

export const DEFAULT_ACTIVE_MODELS: Record<LLMTask, string> = {
  triage: 'ollama:qwen3:4b',
  write_en: 'ollama:qwen3:8b',
  write_ur: 'ollama:qalb:8b-q4',
  qa: 'ollama:qwen3:4b',
  embed: 'ollama:nomic-embed-text',
  social: 'ollama:qwen3:4b',
}

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
export const DEFAULT_GEMINI_EMBED_MODEL = 'gemini-embedding-001'
