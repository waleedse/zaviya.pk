import { z } from 'zod'
import { zodToJsonSchema, type LLMRouter } from '@zaviya/llm'
import type { PayloadClient } from '../payload-client.js'
import type { TelegramAlerts } from '../telegram/bot.js'
import { logger } from '../logger.js'

export interface DailyLearning {
  pageviewRollups: number
  categoryWeights: Record<string, number>
  gscConfigured: boolean
  gscPages: number
  gscError?: string
  titleCandidates: { articleId: string; locale: 'en'; title: string; impressions: number; ctr: number; position: number; topQueries: string[] }[]
  topQueries: { query: string; clicks: number; impressions: number }[]
}

const TitleSchema = z.object({ title: z.string().min(30).max(80), reason: z.string() })

/** Daily: refresh learned weights, then rewrite headlines Google shows but people don't click. */
export async function runLearningJob(deps: { payload: PayloadClient; router: LLMRouter; telegram?: TelegramAlerts }) {
  const res = await deps.payload.request<DailyLearning>('POST', '/api/pipeline/metrics/daily', {})
  const changed: string[] = []
  for (const c of res.titleCandidates) {
    try {
      const out = await deps.router.chat('seo', {
        messages: [
          {
            role: 'system',
            content:
              'You improve news headlines for click-through from Google without clickbait. Keep every fact of the original; match the words people actually searched; 50-65 characters; no question marks unless it is an explainer; no ALL CAPS. Output JSON only.',
          },
          {
            role: 'user',
            content: `Current headline: ${c.title}\nShown ${c.impressions} times in Google, clicked ${(c.ctr * 100).toFixed(1)}%, average position ${c.position.toFixed(1)}.\nTop searches that showed it: ${c.topQueries.join(' | ')}`,
          },
        ],
        format: zodToJsonSchema(TitleSchema, { target: 'openApi3' }) as Record<string, unknown>,
        temperature: 0.4,
      })
      const t = TitleSchema.parse(JSON.parse(out.content))
      if (t.title.trim().toLowerCase() === c.title.trim().toLowerCase()) continue
      await deps.payload.request('POST', `/api/pipeline/articles/${c.articleId}/retitle`, { locale: 'en', title: t.title, reason: t.reason })
      changed.push(`• "${c.title}" → "${t.title}"`)
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : e, articleId: c.articleId }, 'retitle failed')
    }
  }
  const weights = Object.entries(res.categoryWeights)
    .filter(([, w]) => w !== 1)
    .map(([k, w]) => `${k} ×${w}`)
    .join(', ')
  await deps.telegram?.notify(
    [
      '📈 Zaviya daily learning',
      `Category weights: ${weights || 'all neutral (not enough data yet)'}`,
      res.gscConfigured ? `Search Console: ${res.gscPages} pages tracked` : 'Search Console not connected yet',
      res.topQueries.length ? `Top searches: ${res.topQueries.slice(0, 5).map((q) => q.query).join(', ')}` : '',
      changed.length ? `Headlines improved:\n${changed.join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )
  return { ...res, retitled: changed.length }
}
