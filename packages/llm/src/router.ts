import { GeminiProvider } from './gemini.js'
import { GeminiBudget, type BudgetConfig, type BudgetStore } from './budget.js'
import { OllamaProvider } from './ollama.js'
import { Semaphore } from './semaphore.js'
import type { CliProvider } from './cli.js'
import type { ChatResult, LLMProvider, LLMTask, Msg, ToolDef, JSONSchema, LlmPriority } from './types.js'
import { TASK_PRIORITY, DEFAULT_ACTIVE_MODELS, DEFAULT_GEMINI_EMBED_MODEL, DEFAULT_GEMINI_MODEL, GEMINI_BULK_CHAIN, GEMINI_VISION_CHAIN, GEMINI_WRITER_CHAIN } from './types.js'

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
  /** Where the per-model Gemini budget is counted (Redis, shared by every worker process); in-process when omitted */
  budgetStore?: BudgetStore
  /** Per-model limit overrides and priority reserves */
  budget?: BudgetConfig
  /**
   * Subscription CLIs tried first, in order, for the listed tasks (e.g. Cursor, then Claude Haiku
   * for writing). A resting or failing engine is skipped and the normal chain takes over.
   */
  subscriptionChain?: { provider: CliProvider; model: string; tasks: LLMTask[] }[]
  /** Embeddings provider tried before the task's normal chain (the local ONNX model) */
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
  return task === 'write_en' || task === 'write_ur' ? GEMINI_WRITER_CHAIN : GEMINI_BULK_CHAIN
}

export class LLMRouter {
  private readonly ollama: OllamaProvider
  private readonly gemini: GeminiProvider | null
  private readonly ollamaSemaphore = new Semaphore(1)
  private readonly defaultTimeoutMs: number
  private settings: RouterSettings
  private readonly localModel: string
  private readonly subscriptionChain: NonNullable<LLMRouterOptions['subscriptionChain']>
  private readonly embedder?: LLMRouterOptions['embedder']

  constructor(opts: LLMRouterOptions = {}) {
    this.ollama = new OllamaProvider(opts.ollamaUrl)
    this.gemini = opts.geminiApiKey
      ? new GeminiProvider(opts.geminiApiKey, undefined, undefined, undefined, new GeminiBudget(opts.budgetStore, opts.budget))
      : null
    this.settings = opts.settings ?? {}
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 120_000
    this.localModel = opts.localModel ?? DEFAULT_LOCAL_MODEL
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
      provider = 'gemini'
      model = geminiFallbackModel(task)
    }
    // Only Gemini (free tier) and a local Ollama that actually answers: paid `api:` refs in old settings go to Gemini
    if (provider === 'api') {
      provider = 'gemini'
      model = geminiFallbackModel(task)
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
      /** A story trending in Pakistan (Google Trends / trend-gap mark): first call on the daily Gemini budget */
      urgent?: boolean
    },
  ): Promise<ChatResult> {
    const priority: LlmPriority = opts.urgent ? 'urgent' : TASK_PRIORITY[task]
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
          priority,
          task,
        })
      if (provider.id === 'ollama') return this.ollamaSemaphore.run(exec)
      return exec()
    }

    try {
      return await run(primary, primaryModel)
    } catch (err) {
      // Screenshots only go to Gemini: a text-only local or paid fallback would answer blind
      if (task === 'vision') throw err
      if (primary.id === 'ollama' && this.gemini) {
        return run(this.gemini, geminiFallbackModel(task))
      }
      // Gemini failed or its free quota is used up: the local model, but only if Ollama really answers (no paid fallback).
      if (primary.id === 'gemini' && this.localModel !== 'off' && (await this.providerHealth(this.ollama))) {
        return run(this.ollama, this.localModel)
      }
      throw err
    }
  }

  /** Name of the embedding space new vectors live in; stored next to each vector so only like is compared with like. */
  embedModelId(): string {
    return this.embedder ? `${this.embedder.provider.id}:${this.embedder.model}` : 'router-default'
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
      if (primary.id === 'ollama' && this.gemini) {
        return run(this.gemini, geminiFallbackModel(task))
      }
      throw err
    }
  }

  /** Today's calls, limits and headroom per Gemini model (for the heartbeat log and the 3-hourly run). */
  async budgetSummary() {
    if (!this.gemini) return []
    const models = [...new Set([GEMINI_WRITER_CHAIN, GEMINI_BULK_CHAIN, GEMINI_VISION_CHAIN].flatMap((c) => c.split(',')))]
    return this.gemini.budget.summary(models)
  }

  async health(): Promise<{ ollama: boolean; gemini: boolean }> {
    return {
      ollama: await this.providerHealth(this.ollama),
      gemini: this.gemini ? await this.providerHealth(this.gemini) : false,
    }
  }
}
