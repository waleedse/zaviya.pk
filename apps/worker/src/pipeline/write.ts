import { PageReadResultSchema } from '@zaviya/shared'
import type { BridgeServer } from '../bridge/server.js'
import { WriterOutputSchema, type WriterOutput } from '@zaviya/shared'
import { isQuotaExhausted, zodToJsonSchema, type LLMRouter } from '@zaviya/llm'
import type { PayloadClient } from '../payload-client.js'
import { writeEnSystemPrompt, WRITE_EN_PROMPT_VERSION } from '../prompts/write_en.js'
import { writeUrSystemPrompt, WRITE_UR_PROMPT_VERSION } from '../prompts/write_ur.js'
import { extractUrls } from './qa-checks.js'
import { logger } from '../logger.js'
import type { WorkerEnv } from '../config.js'
import type { Redis } from 'ioredis'
import { researchSeo, seoBrief, type SeoPlan } from './seo.js'
import { opinionCue, pageFromWrongOutlet } from './story-kind.js'

export interface WriteResult {
  en: WriterOutput & { title: string }
  /** Missing while the site runs English-only (WRITE_URDU=false) */
  ur?: WriterOutput & { title: string }
  allowedUrls: string[]
  promptVersions: { en: string; ur: string }
  seo?: SeoPlan
  /** Which model actually wrote each locale (after any rotation/fallback) */
  models?: { en: string; ur?: string }
}

function wrapSources(items: { id?: string; title: string; contentText?: string; summary?: string; url: string }[]) {
  // ~12k characters of source text keeps the prompt inside a local model's 8k-token window.
  const perItem = Math.max(1200, Math.floor(12_000 / Math.max(1, items.length)))
  return items
    .slice(0, 8)
    .map((it) => ({ ...it, contentText: it.contentText?.slice(0, perItem) }))
    .map(
      (it, i) =>
        `<source id="${it.id ?? i}">\n${it.title}\n${it.summary ?? ''}\n${it.contentText ?? ''}\nURL: ${it.url}\n</source>`,
    )
    .join('\n\n')
}

function extractJson(text: string): string {
  const t = text.trim()
  if (t.startsWith('{')) return t
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)
  if (fence?.[1]) return fence[1].trim()
  const a = t.indexOf('{')
  const b = t.lastIndexOf('}')
  return a >= 0 && b > a ? t.slice(a, b + 1) : t
}

/** Related Zaviya stories the writer may link to (fetched up front instead of via tool calls). */
async function internalLinksBlock(payload: PayloadClient, keywords: string[], locale: 'en' | 'ur', urlLog: Set<string>): Promise<string> {
  if (!keywords.length) return ''
  try {
    const { links } = await payload.internalLinks(keywords.slice(0, 6), locale, 5)
    if (!links.length) return ''
    for (const l of links) urlLog.add(l.url)
    return `\n\nRelated Zaviya articles you may link to where genuinely relevant (use the exact URLs):\n${links.map((l) => `- ${l.title}: ${l.url}`).join('\n')}`
  } catch {
    return ''
  }
}

export function pickBestTitle(options: string[], checks: { maxSimilarity: number }[]): string {
  let best = options[0]!
  let bestScore = Infinity
  for (let i = 0; i < options.length; i++) {
    const t = options[i]!
    const sim = checks[i]?.maxSimilarity ?? 1
    const lenPenalty = Math.abs(t.length - 60) * 0.01
    const score = sim + lenPenalty
    if (score < bestScore) {
      bestScore = score
      best = t
    }
  }
  return best
}

export function stripUnverifiedUrls(body: string, allowed: Set<string>): string {
  const urls = extractUrls(body)
  let out = body
  for (const u of urls) {
    if (!allowed.has(u)) {
      out = out.replaceAll(u, '')
      logger.warn({ url: u }, 'stripped unverified URL from draft')
    }
  }
  return out
}

async function runLocaleWrite(
  task: 'write_en' | 'write_ur',
  deps: {
    router: LLMRouter
    payload: PayloadClient
    system: string
    userContent: string
    urlLog: Set<string>
    locale: 'en' | 'ur'
  },
): Promise<WriterOutput & { title: string; model: string }> {
  const format = zodToJsonSchema(WriterOutputSchema, { target: 'openApi3' }) as Record<string, unknown>
  const messages = [
    { role: 'system' as const, content: deps.system },
    { role: 'user' as const, content: deps.userContent },
  ]
  // One request per locale: the sources and links are already in the prompt.
  const res = await deps.router.chat(task, { messages, format, temperature: 0.4, maxTokens: 8192, timeoutMs: 180_000 })
  let model = `${res.provider}:${res.model}`
  let parsed: WriterOutput
  try {
    parsed = WriterOutputSchema.parse(JSON.parse(extractJson(res.content)))
  } catch (err) {
    // One repair pass with the validation error, instead of discarding the draft.
    const repair = await deps.router.chat(task, {
      messages: [
        ...messages,
        { role: 'assistant', content: res.content },
        { role: 'user', content: `That JSON is invalid: ${err instanceof Error ? err.message.slice(0, 800) : String(err)}. Return the corrected JSON only.` },
      ],
      format,
      temperature: 0,
      timeoutMs: 180_000,
    })
    model = `${repair.provider}:${repair.model}`
    parsed = WriterOutputSchema.parse(JSON.parse(extractJson(repair.content)))
  }

  const checks = await Promise.all(
    parsed.titleOptions.map((t) => deps.payload.titleCheck(t, deps.locale).catch(() => ({ maxSimilarity: 1 }))),
  )
  const title = pickBestTitle(parsed.titleOptions, checks)
  const bodyMarkdown = stripUnverifiedUrls(parsed.bodyMarkdown, deps.urlLog)
  return { ...parsed, bodyMarkdown, title, model }
}

/** Read up to three thin source items through the extension; true when any text was saved. */
export async function enrichFromExtension(
  items: { id?: string; title: string; summary?: string; contentText?: string; url: string }[],
  payload: PayloadClient,
  bridge: Pick<BridgeServer, 'isOnline' | 'send'>,
  clusterId: string,
  max = 3,
): Promise<boolean> {
  let saved = false
  const thin = items.filter((it) => it.id && sourceTextChars([it]) === 0).slice(0, max)
  for (const it of thin) {
    try {
      const raw = await bridge.send({ id: `read_${clusterId}_${it.id}_${Date.now()}`, type: 'page.read', payload: { url: it.url } }, 60_000)
      const page = PageReadResultSchema.parse(raw)
      if (page.text.length < 300) continue
      // The extension must have read the outlet the headline names (a stale tab once returned a Dawn editorial for a Nikkei item)
      if (pageFromWrongOutlet(it.title, page.url)) {
        logger.warn({ clusterId, itemId: it.id, host: new URL(page.url).hostname, title: it.title }, 'extension page is from a different outlet than the headline, ignored')
        continue
      }
      await payload.patchSourceItem(it.id!, { contentText: `${page.text}\n\n(Read from ${new URL(page.url).hostname})` })
      saved = true
      logger.info({ clusterId, itemId: it.id, host: new URL(page.url).hostname, chars: page.text.length }, 'source text read by extension')
    } catch (e) {
      logger.warn({ clusterId, itemId: it.id, err: e instanceof Error ? e.message : e }, 'extension page read failed')
    }
  }
  return saved
}

/** Characters of real reporting in the sources (summary + extracted text, not titles). */
export function sourceTextChars(items: { title: string; summary?: string; contentText?: string }[]): number {
  return items.reduce((n, it) => {
    const text = `${it.summary ?? ''} ${it.contentText ?? ''}`.replace(/\s+/g, ' ').trim()
    // Google News summaries just repeat the headline and outlet name
    return n + (text.length > it.title.length + 40 ? text.length : 0)
  }, 0)
}

export async function processWriteJob(
  data: { clusterId: string; feedback?: string[] },
  deps: { router: LLMRouter; payload: PayloadClient; env: WorkerEnv; redis?: Redis; bridge?: Pick<BridgeServer, 'isOnline' | 'send'> },
): Promise<WriteResult | null> {
  let cluster = await deps.payload.getCluster(data.clusterId)
  // Hybrid sourcing: when the sources carry only headlines (blocked outlets, Google News links),
  // the Chrome extension opens the pages in Waleed's browser and sends back the article text.
  if (sourceTextChars(cluster.items) < deps.env.MIN_SOURCE_CHARS && deps.bridge?.isOnline()) {
    if (await enrichFromExtension(cluster.items, deps.payload, deps.bridge, data.clusterId)) {
      cluster = await deps.payload.getCluster(data.clusterId)
    }
  }
  // An editorial or column is not a news report (ZAV-155); the text read just now may reveal one
  const opinion = opinionCue(cluster.items)
  if (opinion) {
    await deps.payload.patchCluster(data.clusterId, { status: 'rejected', triage: { ...((cluster.triage ?? {}) as Record<string, unknown>), codeOutcome: 'reject', deferReason: opinion } })
    logger.info({ clusterId: data.clusterId, reason: opinion }, 'write skipped: the source is opinion')
    return null
  }
  // Headline-only items (Google News links, blocked outlets) give the writer nothing to report.
  // Without real source text it writes "about the headline" instead of the news: skip until an
  // outlet with readable text joins the cluster (a new item re-triggers triage).
  const sourceChars = sourceTextChars(cluster.items)
  if (sourceChars < deps.env.MIN_SOURCE_CHARS) {
    await deps.payload.patchCluster(data.clusterId, { status: 'triaged' })
    logger.info({ clusterId: data.clusterId, sourceChars }, 'write skipped: not enough source text yet')
    return null
  }
  const seo = await researchSeo(cluster, deps)
  if (seo) logger.info({ clusterId: data.clusterId, keyword: seo.plan.primaryKeyword, trends: seo.matchedTrends }, 'SEO plan ready')
  const urlLog = new Set<string>()
  for (const it of cluster.items) urlLog.add(it.url)

  const sourcesBlock = wrapSources(cluster.items)
  const feedbackBlock = data.feedback?.length
    ? `\n\nA previous draft failed editorial QA. Fix every issue below:\n${data.feedback.map((f) => `- ${f}`).join('\n')}`
    : ''
  let en: WriterOutput & { title: string; model: string }
  let ur: (WriterOutput & { title: string; model: string }) | undefined

  const keywords = seo ? [seo.plan.primaryKeyword, ...seo.plan.secondaryKeywords] : [cluster.headline ?? cluster.items[0]?.title ?? '']
  const linksEn = await internalLinksBlock(deps.payload, keywords.filter(Boolean), 'en', urlLog)

  try {
    en = await runLocaleWrite('write_en', {
      ...deps,
      system: writeEnSystemPrompt(),
      userContent: `Write the English article for this cluster.\n\n${seo ? `${seoBrief(seo.plan, 'en')}\n\n` : ''}${sourcesBlock}${linksEn}${feedbackBlock}`,
      urlLog,
      locale: 'en',
    })
  } catch (e) {
    if (isQuotaExhausted(e)) throw e
    logger.warn({ err: e instanceof Error ? e.message : e }, 'write_en failed')
    return null
  }

  if (deps.env.WRITE_URDU) try {
    const linksUr = await internalLinksBlock(deps.payload, keywords.filter(Boolean), 'ur', urlLog)
    ur = await runLocaleWrite('write_ur', {
      ...deps,
      system: writeUrSystemPrompt({ title: en.title, dek: en.dek }),
      userContent: `Write the Urdu article using sources and the English reference.\n\n${seo ? `${seoBrief(seo.plan, 'ur')}\n\n` : ''}${sourcesBlock}${linksUr}${feedbackBlock}`,
      urlLog,
      locale: 'ur',
    })
  } catch (e) {
    if (isQuotaExhausted(e)) throw e
    logger.warn({ err: e instanceof Error ? e.message : e }, 'write_ur failed')
    return null
  }

  logger.info({ clusterId: data.clusterId, en: en.model, ur: ur?.model, title: en.title }, 'article written')
  return {
    en,
    ur,
    allowedUrls: [...urlLog],
    promptVersions: { en: WRITE_EN_PROMPT_VERSION, ur: WRITE_UR_PROMPT_VERSION },
    seo: seo?.plan,
    models: { en: en.model, ur: ur?.model },
  }
}
