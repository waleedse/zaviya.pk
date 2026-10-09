import { z } from 'zod'
import { CATEGORY_SLUGS, PRIORITIES, SENSITIVITY_FLAGS } from './constants'

/** LLM triage output. Validated before any rule runs. */
export const TriageResultSchema = z.object({
  pakistanRelevance: z.number().min(0).max(1),
  newsworthiness: z.number().min(0).max(1),
  sourceCredibility: z.number().min(0).max(1),
  category: z.enum(CATEGORY_SLUGS),
  sensitivityFlags: z.array(z.enum(SENSITIVITY_FLAGS)),
  isUpdateOfExisting: z.boolean(),
  existingArticleId: z.string().optional(),
  suggestedPriority: z.enum(PRIORITIES),
  decision: z.enum(['publish', 'review', 'reject']),
  reason: z.string().max(400),
})
export type TriageResult = z.infer<typeof TriageResultSchema>

export const FAQSchema = z.object({ q: z.string(), a: z.string() })

/** LLM writer output (one locale). */
export const WriterOutputSchema = z.object({
  titleOptions: z.array(z.string().min(20).max(110)).length(3),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  dek: z.string().min(60).max(240),
  keyPoints: z.array(z.string()).min(3).max(5),
  bodyMarkdown: z.string().min(400),
  whatItMeans: z.string().min(80),
  faqs: z.array(FAQSchema).min(2).max(6),
  tags: z.array(z.string()).max(8),
  imageBrief: z.string(),
  altText: z.string().max(200),
  socialCopy: z.object({
    facebook: z.string().max(600),
    instagram: z.string().max(2000),
    x: z.string().max(260),
  }),
})
export type WriterOutput = z.infer<typeof WriterOutputSchema>

export const QAResultSchema = z.object({
  unsupportedClaims: z.array(z.string()),
  styleIssues: z.array(z.string()),
  pass: z.boolean(),
})
export type QAResult = z.infer<typeof QAResultSchema>

/** Worker <-> Chrome extension WebSocket protocol. */
export const BridgeJobSchema = z.discriminatedUnion('type', [
  z.object({ id: z.string(), type: z.literal('x.post'), payload: z.object({ text: z.string(), mediaUrls: z.array(z.string()).default([]) }) }),
  z.object({ id: z.string(), type: z.literal('x.readList'), payload: z.object({ listUrl: z.string(), sinceId: z.string().optional() }) }),
  z.object({ id: z.string(), type: z.literal('instagram.post'), payload: z.object({ caption: z.string(), mediaUrls: z.array(z.string()).min(1) }) }),
  z.object({ id: z.string(), type: z.literal('gemini.image'), payload: z.object({ prompt: z.string() }) }),
])
export type BridgeJob = z.infer<typeof BridgeJobSchema>

export const BridgeMessageSchema = z.union([
  z.object({ type: z.literal('hello'), token: z.string(), version: z.string() }),
  z.object({ type: z.literal('heartbeat'), tabs: z.record(z.boolean()) }),
  z.object({ id: z.string(), ok: z.literal(true), result: z.unknown() }),
  z.object({ id: z.string(), ok: z.literal(false), error: z.string() }),
])
export type BridgeMessage = z.infer<typeof BridgeMessageSchema>

/** X post as read by API or extension. */
export const XPostSchema = z.object({
  id: z.string(),
  author: z.string(),
  text: z.string(),
  url: z.string(),
  createdAt: z.string(),
  mediaUrls: z.array(z.string()).default([]),
})
export type XPost = z.infer<typeof XPostSchema>
