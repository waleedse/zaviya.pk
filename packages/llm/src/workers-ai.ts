import type { ChatResult, LLMProvider } from './types.js'

/**
 * Cloudflare Workers AI embeddings (bge-base-en-v1.5, 768 dimensions, same as the pgvector column).
 * Its free allowance covers thousands of headlines a day, where Gemini's free tier stops at 1,000.
 */
export const WORKERS_AI_EMBED_MODEL = '@cf/baai/bge-base-en-v1.5'

export class WorkersAIProvider implements LLMProvider {
  readonly id = 'workers-ai'

  constructor(
    private readonly accountId: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async health(): Promise<boolean> {
    return Boolean(this.accountId && this.token)
  }

  async chat(): Promise<ChatResult> {
    throw new Error('workers-ai provider only embeds')
  }

  async embed(model: string, input: string[]): Promise<number[][]> {
    const res = await this.fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model || WORKERS_AI_EMBED_MODEL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input.map((t) => t.slice(0, 2000)) }),
      signal: AbortSignal.timeout(30_000),
    })
    const json = (await res.json().catch(() => null)) as { success?: boolean; result?: { data?: number[][] }; errors?: unknown } | null
    const data = json?.result?.data
    if (!res.ok || !data || data.length !== input.length) {
      throw new Error(`Workers AI embed failed (${res.status}): ${JSON.stringify(json?.errors ?? null).slice(0, 200)}`)
    }
    return data
  }
}
