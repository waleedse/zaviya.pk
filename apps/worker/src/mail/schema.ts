import { z } from 'zod'

export const AGENTS = ['engineer', 'seo', 'editor', 'product', 'social'] as const
export const PLATFORMS = ['facebook', 'instagram', 'x'] as const
export const ACTION_TYPES = ['status', 'pause', 'resume', 'video_now', 'video_skip', 'retract', 'set_cap', 'handoff', 'answer', 'unknown'] as const

export const CONFIDENCE_GATE = 0.7

/** What the model returns: one flat shape (response schemas dislike unions), checked per type afterwards */
export const LlmReplySchema = z.object({
  actions: z
    .array(
      z.object({
        type: z.enum(ACTION_TYPES),
        args: z
          .object({
            slot: z.string().optional(),
            articleId: z.string().optional(),
            url: z.string().optional(),
            reason: z.string().optional(),
            platform: z.string().optional(),
            perDay: z.number().optional(),
            agent: z.string().optional(),
            title: z.string().optional(),
            details: z.string().optional(),
            contentOrSeo: z.boolean().optional(),
            question: z.string().optional(),
          })
          .default({}),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(6),
  reply_summary: z.string().max(600).default(''),
})
export type LlmReply = z.infer<typeof LlmReplySchema>

const slot = z.string().trim().min(1).max(40)

/** Strict argument shapes; an action whose args fail these is turned into `unknown` */
export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), args: z.object({}).passthrough() }),
  z.object({ type: z.literal('pause'), args: z.object({}).passthrough() }),
  z.object({ type: z.literal('resume'), args: z.object({}).passthrough() }),
  z.object({ type: z.literal('video_now'), args: z.object({ slot }) }),
  z.object({ type: z.literal('video_skip'), args: z.object({ slot }) }),
  z.object({
    type: z.literal('retract'),
    args: z
      .object({ articleId: z.string().trim().min(1).max(60).optional(), url: z.string().trim().max(500).optional(), reason: z.string().trim().max(300).default('Email command') })
      .refine((a) => a.articleId || a.url, 'articleId or url is required'),
  }),
  z.object({ type: z.literal('set_cap'), args: z.object({ platform: z.enum(PLATFORMS), perDay: z.number().int().min(0).max(100) }) }),
  z.object({
    type: z.literal('handoff'),
    args: z.object({
      agent: z.enum(AGENTS),
      title: z.string().trim().min(3).max(160),
      details: z.string().trim().max(4000).default(''),
      contentOrSeo: z.boolean().default(false),
    }),
  }),
  z.object({ type: z.literal('answer'), args: z.object({ question: z.string().trim().min(1).max(500) }) }),
  z.object({ type: z.literal('unknown'), args: z.object({}).passthrough() }),
])
export type ActionBody = z.infer<typeof ActionSchema>
export type Action = ActionBody & { confidence: number }

/** Actions that change something; below the confidence gate they are not run */
export const READ_ONLY: ReadonlySet<string> = new Set(['status', 'answer', 'unknown'])

export interface Understood {
  source: 'llm' | 'keyword'
  actions: Action[]
  summary: string
}

/** Validate a model reply: bad args become `unknown` rather than being guessed at */
export function validateReply(reply: unknown): Understood {
  const parsed = LlmReplySchema.parse(reply)
  const actions: Action[] = parsed.actions.map((a) => {
    const args = Object.fromEntries(Object.entries(a.args).filter(([, v]) => v !== undefined))
    const strict = ActionSchema.safeParse({ type: a.type, args })
    if (!strict.success) return { type: 'unknown', args: {}, confidence: a.confidence }
    return { ...strict.data, confidence: a.confidence }
  })
  return { source: 'llm', actions, summary: parsed.reply_summary }
}

/** Splits actions into those to run now and those that need him to confirm */
export function applyConfidenceGate(actions: Action[]): { run: Action[]; held: Action[] } {
  const run: Action[] = []
  const held: Action[] = []
  for (const a of actions) {
    if (a.confidence < CONFIDENCE_GATE && !READ_ONLY.has(a.type)) held.push(a)
    else run.push(a)
  }
  return { run, held }
}
