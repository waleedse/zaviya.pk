import { convertMarkdownToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import type { PayloadRequest } from 'payload'
import { z } from 'zod'
import { CATEGORY_SLUGS, PRIORITIES } from '@zaviya/shared'
import type { Article } from '../../payload-types'
import { articlePublicUrls, badRequest, json } from './helpers'

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

async function resolveTags(payload: PayloadRequest['payload'], tagSlugs: string[]) {
  const ids: string[] = []
  for (const slug of tagSlugs) {
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
        data: { slug, name: slug.replace(/-/g, ' ') },
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
            body: await markdownToLexical(req, en.bodyMarkdown),
            whatItMeans: await markdownToLexical(req, en.whatItMeans),
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
