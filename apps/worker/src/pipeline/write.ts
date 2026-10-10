import { WriterOutputSchema, type WriterOutput } from '@zaviya/shared'
import type { LLMProvider, LLMTask, ToolDef } from '@zaviya/llm'
import { runToolLoop, type LLMRouter } from '@zaviya/llm'
import type { PayloadClient } from '../payload-client.js'
import { writeEnSystemPrompt, WRITE_EN_PROMPT_VERSION } from '../prompts/write_en.js'
import { writeUrSystemPrompt, WRITE_UR_PROMPT_VERSION } from '../prompts/write_ur.js'
import { extractUrls } from './qa-checks.js'
import { logger } from '../logger.js'
import type { WorkerEnv } from '../config.js'

export interface WriteResult {
  en: WriterOutput & { title: string }
  ur: WriterOutput & { title: string }
  allowedUrls: Set<string>
  promptVersions: { en: string; ur: string }
}

function routerProvider(router: LLMRouter, task: LLMTask, model: string): LLMProvider {
  return {
    id: 'router',
    health: async () => true,
    embed: async (m, input) => router.embed(task, input),
    chat: (opts) =>
      router.chat(task, {
        messages: opts.messages,
        tools: opts.tools,
        format: opts.format,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        signal: opts.signal,
      }).then((r) => ({ ...r, model: opts.model || model })),
  }
}

function wrapSources(items: { id?: string; title: string; contentText?: string; summary?: string; url: string }[]) {
  return items
    .map(
      (it, i) =>
        `<source id="${it.id ?? i}">\n${it.title}\n${it.summary ?? ''}\n${it.contentText ?? ''}\nURL: ${it.url}\n</source>`,
    )
    .join('\n\n')
}

export function buildWriterTools(deps: {
  clusterId: string
  payload: PayloadClient
  env: WorkerEnv
  allowDomains: Set<string>
  urlLog: Set<string>
}): ToolDef[] {
  return [
    {
      name: 'web_search',
      description: 'Search the web via SearXNG (top 8)',
      parameters: {
        type: 'object',
        properties: { q: { type: 'string' }, lang: { type: 'string' } },
        required: ['q'],
      },
      handler: async (args) => {
        if (!deps.env.SEARXNG_URL) return { results: [], note: 'SearXNG not configured' }
        const q = String(args.q ?? '')
        const lang = String(args.lang ?? 'en')
        const url = `${deps.env.SEARXNG_URL.replace(/\/$/, '')}/search?q=${encodeURIComponent(q)}&format=json&language=${lang}`
        const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
        if (!res.ok) return { error: res.status }
        const data = (await res.json()) as { results?: { url: string; title: string }[] }
        const results = (data.results ?? []).slice(0, 8)
        for (const r of results) {
          deps.urlLog.add(r.url)
          try {
            deps.allowDomains.add(new URL(r.url).hostname)
          } catch {
            /* ignore */
          }
        }
        return { results }
      },
    },
    {
      name: 'fetch_url',
      description: 'Fetch allowlisted URL text (max 6k chars)',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
      handler: async (args) => {
        const url = String(args.url ?? '')
        let host = ''
        try {
          host = new URL(url).hostname
        } catch {
          return { error: 'invalid url' }
        }
        if (!deps.allowDomains.has(host)) return { error: 'domain not allowlisted' }
        const { fetchArticleText } = await import('../ingest/extract.js')
        const text = await fetchArticleText(url)
        if (text) deps.urlLog.add(url)
        return { text }
      },
    },
    {
      name: 'get_cluster_items',
      description: 'All source texts for this cluster',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        const c = await deps.payload.getCluster(deps.clusterId)
        for (const it of c.items) deps.urlLog.add(it.url)
        return { items: c.items }
      },
    },
    {
      name: 'get_internal_links',
      description: 'Related articles on Zaviya',
      parameters: {
        type: 'object',
        properties: { keywords: { type: 'array', items: { type: 'string' } }, locale: { type: 'string' } },
        required: ['keywords', 'locale'],
      },
      handler: async (args) => {
        const keywords = (args.keywords as string[]) ?? []
        const locale = (args.locale === 'ur' ? 'ur' : 'en') as 'en' | 'ur'
        const links = await deps.payload.internalLinks(keywords, locale)
        for (const l of links.links) deps.urlLog.add(l.url)
        return links
      },
    },
    {
      name: 'check_title',
      description: 'Check title similarity vs recent articles',
      parameters: {
        type: 'object',
        properties: { title: { type: 'string' }, locale: { type: 'string' } },
        required: ['title'],
      },
      handler: async (args) => {
        const title = String(args.title ?? '')
        const locale = (args.locale === 'ur' ? 'ur' : 'en') as 'en' | 'ur'
        return deps.payload.titleCheck(title, locale)
      },
    },
    {
      name: 'get_rate',
      description: 'Latest PKR rate data-point (no dedicated endpoint — returns null unless wired)',
      parameters: { type: 'object', properties: { series: { type: 'string' } }, required: ['series'] },
      handler: async () => null,
    },
    {
      name: 'get_trending_pk',
      description: 'Google Trends daily RSS for Pakistan',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        const res = await fetch('https://trends.google.com/trending/rss?geo=PK', {
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) return { error: res.status }
        const xml = await res.text()
        return { xml: xml.slice(0, 4000) }
      },
    },
  ]
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
    env: WorkerEnv
    clusterId: string
    system: string
    userContent: string
    allowDomains: Set<string>
    urlLog: Set<string>
    locale: 'en' | 'ur'
  },
): Promise<WriterOutput & { title: string }> {
  const ref = deps.router.getModelRef(task)
  const model = ref.includes(':') ? ref.split(':').slice(1).join(':') : ref
  const provider = routerProvider(deps.router, task, model)
  const tools = buildWriterTools({
    clusterId: deps.clusterId,
    payload: deps.payload,
    env: deps.env,
    allowDomains: deps.allowDomains,
    urlLog: deps.urlLog,
  })
  const { parsed } = await runToolLoop(provider, {
    model,
    messages: [
      { role: 'system', content: deps.system },
      { role: 'user', content: deps.userContent },
    ],
    tools,
    outputSchema: WriterOutputSchema,
  })

  const checks = await Promise.all(
    parsed.titleOptions.map((t) => deps.payload.titleCheck(t, deps.locale).catch(() => ({ maxSimilarity: 1 }))),
  )
  const title = pickBestTitle(parsed.titleOptions, checks)
  const bodyMarkdown = stripUnverifiedUrls(parsed.bodyMarkdown, deps.urlLog)
  return { ...parsed, bodyMarkdown, title }
}

export async function processWriteJob(
  data: { clusterId: string },
  deps: { router: LLMRouter; payload: PayloadClient; env: WorkerEnv },
): Promise<WriteResult | null> {
  const cluster = await deps.payload.getCluster(data.clusterId)
  const allowDomains = new Set<string>()
  const urlLog = new Set<string>()
  for (const it of cluster.items) {
    urlLog.add(it.url)
    try {
      allowDomains.add(new URL(it.url).hostname)
    } catch {
      /* ignore */
    }
  }

  const sourcesBlock = wrapSources(cluster.items)
  let en: WriterOutput & { title: string }
  let ur: WriterOutput & { title: string }

  try {
    en = await runLocaleWrite('write_en', {
      ...deps,
      clusterId: data.clusterId,
      system: writeEnSystemPrompt(),
      userContent: `Write the English article for this cluster.\n\n${sourcesBlock}`,
      allowDomains,
      urlLog,
      locale: 'en',
    })
  } catch (e) {
    logger.warn({ err: e }, 'write_en failed')
    return null
  }

  try {
    ur = await runLocaleWrite('write_ur', {
      ...deps,
      clusterId: data.clusterId,
      system: writeUrSystemPrompt({ title: en.title, dek: en.dek }),
      userContent: `Write the Urdu article using sources and the English reference.\n\n${sourcesBlock}`,
      allowDomains,
      urlLog,
      locale: 'ur',
    })
  } catch (e) {
    logger.warn({ err: e }, 'write_ur failed')
    return null
  }

  return {
    en,
    ur,
    allowedUrls: urlLog,
    promptVersions: { en: WRITE_EN_PROMPT_VERSION, ur: WRITE_UR_PROMPT_VERSION },
  }
}
