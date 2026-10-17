import { GeminiProvider } from './gemini.js'
import { OpenAICompatProvider } from './openai-compat.js'
import { OllamaProvider } from './ollama.js'
import { Semaphore } from './semaphore.js'
import type { CliProvider } from './cli.js'
import type { ChatResult, LLMProvider, LLMTask, Msg, ToolDef, JSONSchema } from './types.js'
import { DEFAULT_ACTIVE_MODELS, DEFAULT_GEMINI_EMBED_MODEL, DEFAULT_GEMINI_MODEL, GEMINI_LITE_CHAIN, GEMINI_VISION_CHAIN, GEMINI_WRITER_CHAIN } from './types.js'

export interface RouterSettings {
  activeModels?: Partial<Record<LLMTask, string>>
}

export interface LLMRouterOptions {
  ollamaUrl?: string
  geminiApiKey?: string
  settings?: RouterSettings
  /** Per-call timeout ms (breaking jobs may use 180_000). */
  defaultTimeoutMs?: number
  /** Ollama model for fallbacks (default qwen3:8b); "off" disables the local model */
  localModel?: string
  /** OpenAI-compatible API (DeepSeek, Qwen, OpenRouter…) */
  apiBaseUrl?: string
  apiKey?: string
  /** Model on that API used when Gemini is out of quota (instead of the local model) */
  apiFallbackModel?: string
  /** Cheap model on that API for short JSON jobs when the local model is off (triage, SEO, QA) */
  apiLightModel?: string
  /**
   * Subscription CLIs tried first, in order, for the listed tasks (e.g. Cursor, then Claude Haiku
   * for writing). A resting or failing engine is skipped and the normal chain takes over.
   */
  subscriptionChain?: { provider: CliProvider; model: string; tasks: LLMTask[] }[]
  /** Embeddings provider tried before the task's normal chain (e.g. Cloudflare Workers AI) */
  embedder?: { provider: LLMProvider; model: string }
}

function parseModelRef(ref: string): { provider: 'ollama' | 'gemini' | 'api'; model: string } {
  const [provider, ...rest] = ref.split(':')
  if (provider === 'api') return { provider: 'api', model: rest.join(':') }
  if (provider === 'gemini') {
    return { provider: 'gemini', model: rest.join(':') || DEFAULT_GEMINI_MODEL }
  }
  return { provider: 'ollama', model: rest.join(':') || 'qwen3:4b' }
}

/** Local model used when Gemini is unavailable or out of free quota. */
export const DEFAULT_LOCAL_MODEL = 'qwen3:8b'
const LOCAL_TIMEOUT_MS = 25 * 60_000

function geminiFallbackModel(task: LLMTask): string {
  if (task === 'embed') return DEFAULT_GEMINI_EMBED_MODEL
  if (task === 'vision') return GEMINI_VISION_CHAIN
  return task === 'write_en' || task === 'write_ur' ? GEMINI_WRITER_CHAIN : GEMINI_LITE_CHAIN
}

export class LLMRouter {
  private readonly ollama: OllamaProvider
  private readonly gemini: GeminiProvider | null
  private readonly ollamaSemaphore = new Semaphore(1)
  private readonly defaultTimeoutMs: number
  private settings: RouterSettings
  private readonly localModel: string
  private readonly api: OpenAICompatProvider | null
  private readonly apiFallbackModel?: string
  private readonly apiLightModel?: string
  private readonly subscriptionChain: NonNullable<LLMRouterOptions['subscriptionChain']>
  private readonly embedder?: LLMRouterOptions['embedder']

  constructor(opts: LLMRouterOptions = {}) {
    this.ollama = new OllamaProvider(opts.ollamaUrl)
    this.gemini = opts.geminiApiKey ? new GeminiProvider(opts.geminiApiKey) : null
    this.settings = opts.settings ?? {}
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 120_000
    this.localModel = opts.localModel ?? DEFAULT_LOCAL_MODEL
    this.api = opts.apiBaseUrl && opts.apiKey ? new OpenAICompatProvider(opts.apiBaseUrl, opts.apiKey) : null
    this.apiFallbackModel = opts.apiFallbackModel
    this.apiLightModel = opts.apiLightModel
    this.subscriptionChain = opts.subscriptionChain ?? []
    this.embedder = opts.embedder
  }

  /** Which subscription engines are usable right now (for the control room and agents). */
  subscriptionStatus() {
    return this.subscriptionChain.map((e) => ({ ...e.provider.status(), model: e.model, tasks: e.tasks }))
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
    let { provider, model } = parseModelRef(ref)
    // Local model switched off (it slows the machine): send its text jobs to the cheap Gemini chain.
    if (provider === 'ollama' && task !== 'embed' && this.localModel === 'off') {
      if (this.api && this.apiLightModel) {
        provider = 'api'
        model = this.apiLightModel
      } else {
        provider = 'gemini'
        model = geminiFallbackModel(task)
      }
    }
    if (provider === 'api') {
      if (!this.api) throw new Error('api:* model configured but LLM_API_BASE_URL / LLM_API_KEY are missing')
      return { primary: this.api, primaryModel: model }
    }
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
    // Plain-text jobs only: the CLIs do not take our tool definitions.
    // (never for screenshots: those go to Gemini only)
    if (!opts.tools?.length && task !== 'vision') {
      for (const engine of this.subscriptionChain) {
        if (!engine.tasks.includes(task) || engine.provider.isResting()) continue
        try {
          return await engine.provider.chat({
            model: engine.model,
            messages: opts.messages,
            format: opts.format,
            signal: opts.signal ?? AbortSignal.timeout(Math.max(opts.timeoutMs ?? 0, 6 * 60_000)),
          })
        } catch {
          // Resting, out of plan quota or a bad reply: next engine.
        }
      }
    }

    const { primary, primaryModel } = await this.resolveProviders(task)

    // CPU-only local models are slow: give them far more time than a cloud call.
    const timeoutFor = (provider: LLMProvider) => {
      const base = opts.timeoutMs ?? this.defaultTimeoutMs
      return provider.id === 'ollama' ? Math.max(base, LOCAL_TIMEOUT_MS) : base
    }

    const run = async (provider: LLMProvider, model: string) => {
      // The deadline starts when the call runs, not while it waits for the local model to be free.
      const exec = () =>
        provider.chat({
          model,
          messages: opts.messages,
          tools: opts.tools,
          format: opts.format,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
          signal: opts.signal ?? AbortSignal.timeout(timeoutFor(provider)),
        })
      if (provider.id === 'ollama') return this.ollamaSemaphore.run(exec)
      return exec()
    }

    try {
      return await run(primary, primaryModel)
    } catch (err) {
      // Screenshots only go to Gemini: a text-only local or paid fallback would answer blind
      if (task === 'vision') throw err
      if ((primary.id === 'ollama' || primary.id === 'api') && this.gemini) {
        return run(this.gemini, geminiFallbackModel(task))
      }
      // Gemini failed or its free quota is used up: a cheap paid API if configured, else the local model.
      if (primary.id === 'gemini' && this.api && this.apiFallbackModel) {
        return run(this.api, this.apiFallbackModel)
      }
      if (primary.id === 'gemini' && this.localModel !== 'off' && (await this.providerHealth(this.ollama))) {
        return run(this.ollama, this.localModel)
      }
      throw err
    }
  }

  async embed(task: LLMTask, input: string[]): Promise<number[][]> {
    if (this.embedder) {
      // One embedding space for clustering: no silent fallback to a different model.
      return this.embedder.provider.embed(this.embedder.model, input)
    }
    const { primary, primaryModel } = await this.resolveProviders(task)
    const run = async (provider: LLMProvider, model: string) => {
      const exec = () => provider.embed(model, input)
      if (provider.id === 'ollama') return this.ollamaSemaphore.run(exec)
      return exec()
    }
    try {
      return await run(primary, primaryModel)
    } catch (err) {
      if ((primary.id === 'ollama' || primary.id === 'api') && this.gemini) {
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
