import { convertMarkdownToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import type { PayloadRequest } from 'payload'
import { z } from 'zod'
import { CATEGORY_SLUGS, PRIORITIES } from '@zaviya/shared'
import type { Article } from '../../payload-types'
import { articlePublicUrls, badRequest, json } from './helpers'
import { findDuplicate, withKeyLock } from '../../lib/publish-guard'

const localeContentSchema = z.object({
  title: z.string(),
  titleVariants: z.array(z.string()).default([]),
  slug: z.string(),
  dek: z.string(),
  keyPoints: z.array(z.string()).default([]),
  bodyMarkdown: z.string(),
  whatItMeans: z.string(),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  tags: z.array(z.string()).default([]),
  metaDescription: z.string().optional(),
  altText: z.string().optional(),
})

export const pipelineArticleSchema = z.object({
  articleId: z.string().optional(),
  clusterId: z.string().optional(),
  category: z.enum(CATEGORY_SLUGS),
  priority: z.enum(PRIORITIES),
  isBreaking: z.boolean().optional(),
  isLive: z.boolean().optional(),
  status: z.enum(['draft', 'in_review', 'published']),
  heroMediaId: z.string().optional(),
  sources: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
      tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      publishedAt: z.string().optional(),
    }),
  ),
  embeds: z
    .array(
      z.object({
        type: z.enum(['x', 'instagram', 'youtube']),
        url: z.string(),
      }),
    )
    .optional(),
  ai: z.object({
    model: z.string(),
    promptVersion: z.string(),
    triageScore: z.number().optional(),
    qaScore: z.number().optional(),
    originality: z.number().optional(),
    generatedAt: z.string(),
  }),
  locales: z.object({
    en: localeContentSchema.optional(),
    ur: localeContentSchema.optional(),
  }),
})

async function markdownToLexical(req: PayloadRequest, markdown: string) {
  const editorConfig = await editorConfigFactory.default({ config: req.payload.config })
  return convertMarkdownToLexical({ editorConfig, markdown })
}

/** "Khyber Pakhtunkhwa" -> "khyber-pakhtunkhwa". The worker sends tag names, so URLs must be built here. */
export function tagSlug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

async function resolveTags(payload: PayloadRequest['payload'], tagInputs: string[]) {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const input of tagInputs) {
    const slug = tagSlug(input)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    // Keep the writer's capitalisation for the display name ("PTI", "Khyber Pakhtunkhwa").
    const displayName = /[A-Z\s]/.test(input.trim()) ? input.trim() : slug.replace(/-/g, ' ')
    const found = await payload.find({
      collection: 'tags',
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true,
    })
    if (found.docs[0]) {
      ids.push(String(found.docs[0].id))
    } else {
      const created = await payload.create({
        collection: 'tags',
        data: { slug, name: displayName },
        overrideAccess: true,
      })
      ids.push(String(created.id))
    }
  }
  return ids.map((id) => Number(id))
}

export async function handlePipelineArticles(req: PayloadRequest): Promise<Response> {
  const parsed = pipelineArticleSchema.safeParse(await req.json!())
  if (!parsed.success) {
    return badRequest('Validation failed', parsed.error.flatten())
  }
  const body = parsed.data
  // ZAV-158: creating is "check for an existing article, then create", done one request at a time per cluster, so a
  // retried or concurrent publish of the same cluster returns the first article instead of making a twin.
  if (!body.articleId && body.clusterId) {
    return withKeyLock(`cluster:${body.clusterId}`, async () => {
      const recent = await req.payload.find({
        collection: 'articles',
        where: { storyCluster: { equals: Number(body.clusterId) } },
        draft: true,
        sort: '-createdAt',
        limit: 5,
        depth: 0,
        locale: 'en',
        overrideAccess: true,
      })
      const dup = findDuplicate(recent.docs.map((a) => ({ id: a.id, createdAt: a.createdAt, workflow: a.workflow })))
      if (dup) {
        req.payload.logger.warn(`pipeline/articles: cluster ${body.clusterId} already has article ${dup.id}, not creating another`)
        const wanted = body.status === 'published' ? 'published' : body.status === 'in_review' ? 'in_review' : 'draft'
        // Same stage requested (a retry after a timeout or a failed later step): finish that article, idempotently
        if (dup.workflow === wanted) return createOrUpdateArticle(req, { ...body, articleId: String(dup.id) })
        return json({ id: String(dup.id), status: dup.workflow, urls: await articlePublicUrls(req.payload, String(dup.id)), deduped: true })
      }
      return createOrUpdateArticle(req, body)
    })
  }
  return createOrUpdateArticle(req, body)
}

async function createOrUpdateArticle(req: PayloadRequest, body: z.infer<typeof pipelineArticleSchema>): Promise<Response> {
  const category = await req.payload.find({
    collection: 'categories',
    where: { slug: { equals: body.category } },
    limit: 1,
    overrideAccess: true,
  })
  const categoryId = category.docs[0]?.id
  if (!categoryId) return badRequest(`Unknown category ${body.category}`)

  const en = body.locales.en
  if (!en && !body.articleId) {
    return badRequest('locales.en required for new articles')
  }

  const tagIds = en ? await resolveTags(req.payload, en.tags) : []

  let articleId = body.articleId
  const workflow: Article['workflow'] =
    body.status === 'published' ? 'published' : body.status === 'in_review' ? 'in_review' : 'draft'

  const sharedData: Partial<Article> = {
    category: Number(categoryId),
    priority: body.priority,
    isBreaking: body.isBreaking ?? false,
    isLive: body.isLive ?? false,
    workflow,
    sources: body.sources,
    embeds: body.embeds ?? [],
    ai: body.ai,
    tags: tagIds,
    ...(body.heroMediaId ? { heroImage: Number(body.heroMediaId) } : {}),
    ...(body.clusterId ? { storyCluster: Number(body.clusterId) } : {}),
    publishedAt: body.status === 'published' ? new Date().toISOString() : undefined,
  }

  if (articleId) {
    await req.payload.update({
      collection: 'articles',
      id: articleId,
      locale: 'en',
      data: en
        ? {
            ...sharedData,
            title: en.title,
            titleVariants: en.titleVariants.map((v) => ({ variant: v })),
            slug: en.slug,
            dek: en.dek,
            keyPoints: en.keyPoints.map((p) => ({ point: p })),
            // A blank body or whatItMeans on an update keeps the saved text (ZAV-278).
            ...(en.bodyMarkdown.trim() ? { body: await markdownToLexical(req, en.bodyMarkdown) } : {}),
            ...(en.whatItMeans.trim() ? { whatItMeans: await markdownToLexical(req, en.whatItMeans) } : {}),
            faqs: en.faqs,
            seo: en.metaDescription ? { metaDescription: en.metaDescription } : undefined,
          } as Partial<Article>
        : sharedData,
      draft: body.status !== 'published',
      overrideAccess: true,
      req,
    })
  } else if (en) {
    const enData = {
      ...sharedData,
      title: en.title,
      titleVariants: en.titleVariants.map((v) => ({ variant: v })),
      slug: en.slug,
      dek: en.dek,
      keyPoints: en.keyPoints.map((p) => ({ point: p })),
      body: await markdownToLexical(req, en.bodyMarkdown),
      whatItMeans: await markdownToLexical(req, en.whatItMeans),
      faqs: en.faqs,
      seo: en.metaDescription ? { metaDescription: en.metaDescription } : undefined,
      _status: body.status === 'published' ? ('published' as const) : ('draft' as const),
    }
    const created =
      body.status === 'published'
        ? await req.payload.create({
            collection: 'articles',
            locale: 'en',
            data: enData as never,
            draft: false,
            overrideAccess: true,
            req,
          })
        : await req.payload.create({
            collection: 'articles',
            locale: 'en',
            data: enData as never,
            draft: true,
            overrideAccess: true,
            req,
          })
    articleId = String(created.id)
  }

  const ur = body.locales.ur
  if (ur && articleId) {
    await req.payload.update({
      collection: 'articles',
      id: articleId,
      locale: 'ur',
      data: {
        title: ur.title,
        titleVariants: ur.titleVariants.map((v) => ({ variant: v })),
        slug: ur.slug,
        dek: ur.dek,
        keyPoints: ur.keyPoints.map((p) => ({ point: p })),
        body: await markdownToLexical(req, ur.bodyMarkdown),
        whatItMeans: await markdownToLexical(req, ur.whatItMeans),
        faqs: ur.faqs,
        seo: ur.metaDescription ? { metaDescription: ur.metaDescription } : undefined,
      },
      overrideAccess: true,
      req,
    })
  }

  if (body.status === 'published' && articleId) {
    await req.payload.update({
      collection: 'articles',
      id: articleId,
      data: { _status: 'published', workflow: 'published' },
      overrideAccess: true,
      req,
    })
  }

  const urls = articleId ? await articlePublicUrls(req.payload, articleId) : {}
  return json({
    id: articleId,
    status: body.status,
    urls,
  })
}
