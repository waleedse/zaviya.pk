import type { ChatResult, LLMProvider } from './types.js'

/**
 * Free embeddings that run inside the worker process (ONNX via @huggingface/transformers, no network after the
 * first model download, no per-call cost). 768 dimensions, the same as the pgvector column. Multilingual, so an
 * Urdu headline and its English twin land close together. The int8 model is about 280 MB on disk and 700 MB RSS.
 */
export const LOCAL_EMBED_MODEL = 'Xenova/paraphrase-multilingual-mpnet-base-v2'
export const LOCAL_EMBED_DIMS = 768

type Extractor = (input: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): number[][] }>
export type ExtractorLoader = (model: string) => Promise<Extractor>

async function defaultLoader(model: string): Promise<Extractor> {
  const { pipeline, env } = await import('@huggingface/transformers')
  const cacheDir = process.env.EMBED_CACHE_DIR
  if (cacheDir) env.cacheDir = cacheDir
  // Two threads: the web app and the browser tasks share this machine
  const threads = Number(process.env.EMBED_THREADS) || 2
  const extractor = await pipeline('feature-extraction', model, { dtype: 'q8', session_options: { intraOpNumThreads: threads } })
  return extractor as unknown as Extractor
}

export class LocalEmbedProvider implements LLMProvider {
  readonly id = 'local-embed'
  private extractor: Promise<Extractor> | null = null

  constructor(private readonly loader: ExtractorLoader = defaultLoader) {}

  private load(model: string): Promise<Extractor> {
    if (!this.extractor) {
      this.extractor = this.loader(model).catch((err) => {
        this.extractor = null // try again on the next call (the first download may have failed)
        throw err
      })
    }
    return this.extractor
  }

  async health(): Promise<boolean> {
    return true
  }

  async chat(): Promise<ChatResult> {
    throw new Error('local-embed provider only embeds')
  }

  async embed(model: string, input: string[]): Promise<number[][]> {
    if (!input.length) return []
    const extractor = await this.load(model || LOCAL_EMBED_MODEL)
    const out = (await extractor(input.map((t) => t.slice(0, 1500)), { pooling: 'mean', normalize: true })).tolist()
    if (out.length !== input.length || out.some((v) => v.length !== LOCAL_EMBED_DIMS)) {
      throw new Error(`local embed returned an unexpected shape for model ${model}`)
    }
    return out
  }
}
