import { GeminiProvider } from './gemini.js'
import { OllamaProvider } from './ollama.js'
import { Semaphore } from './semaphore.js'
import type { ChatResult, LLMProvider, LLMTask, Msg, ToolDef, JSONSchema } from './types.js'
import { DEFAULT_ACTIVE_MODELS, DEFAULT_GEMINI_EMBED_MODEL, DEFAULT_GEMINI_MODEL } from './types.js'

export interface RouterSettings {
  activeModels?: Partial<Record<LLMTask, string>>
}

export interface LLMRouterOptions {
  ollamaUrl?: string
  geminiApiKey?: string
  settings?: RouterSettings
  /** Per-call timeout ms (breaking jobs may use 180_000). */
  defaultTimeoutMs?: number
}

function parseModelRef(ref: string): { provider: 'ollama' | 'gemini'; model: string } {
  const [provider, ...rest] = ref.split(':')
  if (provider === 'gemini') {
    return { provider: 'gemini', model: rest.join(':') || DEFAULT_GEMINI_MODEL }
  }
  return { provider: 'ollama', model: rest.join(':') || 'qwen3:4b' }
}

function geminiFallbackModel(task: LLMTask): string {
  if (task === 'embed') return DEFAULT_GEMINI_EMBED_MODEL
  return DEFAULT_GEMINI_MODEL
}

export class LLMRouter {
  private readonly ollama: OllamaProvider
  private readonly gemini: GeminiProvider | null
  private readonly ollamaSemaphore = new Semaphore(1)
  private readonly defaultTimeoutMs: number
  private settings: RouterSettings

  constructor(opts: LLMRouterOptions = {}) {
    this.ollama = new OllamaProvider(opts.ollamaUrl)
    this.gemini = opts.geminiApiKey ? new GeminiProvider(opts.geminiApiKey) : null
    this.settings = opts.settings ?? {}
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 120_000
  }

  updateSettings(settings: RouterSettings): void {
    this.settings = { ...this.settings, ...settings }
  }

  getModelRef(task: LLMTask): string {
    return this.settings.activeModels?.[task] ?? DEFAULT_ACTIVE_MODELS[task]
  }

  private async providerHealth(p: LLMProvider): Promise<boolean> {
    try {
      return await p.health()
    } catch {
      return false
    }
  }

  private async resolveProviders(task: LLMTask): Promise<{ primary: LLMProvider; primaryModel: string; fallback?: LLMProvider; fallbackModel?: string }> {
    const ref = this.getModelRef(task)
    const { provider, model } = parseModelRef(ref)
    const primary = provider === 'gemini' ? this.gemini : this.ollama
    if (!primary) {
      if (!this.gemini) throw new Error(`No LLM provider available for task ${task}`)
      return { primary: this.gemini, primaryModel: geminiFallbackModel(task) }
    }
    const healthy = await this.providerHealth(primary)
    if (healthy) {
      return { primary, primaryModel: model }
    }
    if (provider === 'ollama' && this.gemini) {
      return {
        primary: this.gemini,
        primaryModel: geminiFallbackModel(task),
        fallback: primary,
        fallbackModel: model,
      }
    }
    return { primary, primaryModel: model }
  }

  async chat(
    task: LLMTask,
    opts: {
      messages: Msg[]
      tools?: ToolDef[]
      format?: JSONSchema
      temperature?: number
      maxTokens?: number
      timeoutMs?: number
      signal?: AbortSignal
    },
  ): Promise<ChatResult> {
    const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs
    const signal = opts.signal ?? AbortSignal.timeout(timeoutMs)
    const { primary, primaryModel } = await this.resolveProviders(task)

    const run = async (provider: LLMProvider, model: string) => {
      const exec = () =>
        provider.chat({
          model,
          messages: opts.messages,
          tools: opts.tools,
          format: opts.format,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
          signal,
        })
      if (provider.id === 'ollama') return this.ollamaSemaphore.run(exec)
      return exec()
    }

    try {
      return await run(primary, primaryModel)
    } catch (err) {
      if (primary.id === 'ollama' && this.gemini) {
        const fbModel = geminiFallbackModel(task)
        return run(this.gemini, fbModel)
      }
      throw err
    }
  }

  async embed(task: LLMTask, input: string[]): Promise<number[][]> {
    const { primary, primaryModel } = await this.resolveProviders(task)
    const run = async (provider: LLMProvider, model: string) => {
      const exec = () => provider.embed(model, input)
      if (provider.id === 'ollama') return this.ollamaSemaphore.run(exec)
      return exec()
    }
    try {
      return await run(primary, primaryModel)
    } catch (err) {
      if (primary.id === 'ollama' && this.gemini) {
        return run(this.gemini, geminiFallbackModel(task))
      }
      throw err
    }
  }

  async health(): Promise<{ ollama: boolean; gemini: boolean }> {
    return {
      ollama: await this.providerHealth(this.ollama),
      gemini: this.gemini ? await this.providerHealth(this.gemini) : false,
    }
  }
}
