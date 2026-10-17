import { zodToJsonSchema, isQuotaExhausted } from '@zaviya/llm'
import type { LLMRouter } from '@zaviya/llm'
import { LlmReplySchema, validateReply, type Action, type Understood } from './schema.js'

export const EXAMPLES = [
  'status',
  'pause the news   /   resume',
  'video now morning   /   skip the evening video',
  'retract https://zaviya.pk/en/... because it is wrong',
  'set instagram cap to 6 per day',
  'ask the SEO agent to audit the Karachi pages',
]

/** Thrown when no model could answer (quota, outage, bad JSON): the caller falls back to keywords */
export class ModelUnavailable extends Error {
  constructor(
    message: string,
    readonly quota = false,
  ) {
    super(message)
    this.name = 'ModelUnavailable'
  }
}

export function systemPrompt(slots: string[], todayIso: string): string {
  return `You turn one email from Waleed (owner of Zaviya, a Pakistani news site) into a list of actions for the Zaviya server.
The email may be in English, Urdu or Roman Urdu. Today is ${todayIso} (Karachi). Output JSON only, no prose.

Action types and args:
- status {}: how things are right now (published today, queues, social posts, videos, errors)
- pause {} / resume {}: stop or restart the news pipeline
- video_now {slot}: render and post today's video slot now. Slots: ${slots.join(', ') || 'none'}
- video_skip {slot}: cancel today's video for that slot
- retract {articleId or url, reason}: take one article down (a code is asked for first)
- set_cap {platform: facebook|instagram|x, perDay: 0..100}: social posts per day on one platform
- handoff {agent: engineer|seo|editor|product|social, title, details, contentOrSeo}: anything else that needs work (code, SEO, editorial, product, social). Put his request in details. contentOrSeo is true only for content or SEO requests.
- answer {question}: a factual question the live status data can answer
- unknown {}: you cannot tell what he wants

confidence is 0..1: how sure you are of the action AND its args. Use < 0.7 when guessing a slot, article or number.
Never invent an articleId, url, slot or number he did not give. One action per wish; no actions beyond what he asked.
reply_summary: one short sentence in English saying what you understood.

Examples:
"status please" -> {"actions":[{"type":"status","args":{},"confidence":0.98}],"reply_summary":"Status report."}
"sab rok do" -> {"actions":[{"type":"pause","args":{},"confidence":0.85}],"reply_summary":"Pause the news pipeline."}
"dobara chalu karo" -> {"actions":[{"type":"resume","args":{},"confidence":0.9}],"reply_summary":"Resume the pipeline."}
"morning video abhi chala do" -> {"actions":[{"type":"video_now","args":{"slot":"morning"},"confidence":0.93}],"reply_summary":"Post the morning video now."}
"آج کی شام کی ویڈیو نہ لگانا" -> {"actions":[{"type":"video_skip","args":{"slot":"evening"},"confidence":0.9}],"reply_summary":"Skip tonight's evening video."}
"instagram par din mein 5 post kafi hain" -> {"actions":[{"type":"set_cap","args":{"platform":"instagram","perDay":5},"confidence":0.88}],"reply_summary":"Set the Instagram cap to 5 a day."}
"take down https://zaviya.pk/en/foo-123, the figures are wrong" -> {"actions":[{"type":"retract","args":{"url":"https://zaviya.pk/en/foo-123","reason":"The figures are wrong"},"confidence":0.95}],"reply_summary":"Retract that article."}
"SEO agent se kaho Karachi weather pages ka audit kare" -> {"actions":[{"type":"handoff","args":{"agent":"seo","title":"Audit the Karachi weather pages","details":"Waleed asked for an audit of the Karachi weather pages.","contentOrSeo":true},"confidence":0.9}],"reply_summary":"Ask the SEO agent for a Karachi weather audit."}
"the share button is broken on mobile" -> {"actions":[{"type":"handoff","args":{"agent":"engineer","title":"Share button broken on mobile","details":"Waleed reports the share button is broken on mobile.","contentOrSeo":false},"confidence":0.85}],"reply_summary":"Hand the broken share button to the engineer."}
"how many posts went out on X today?" -> {"actions":[{"type":"answer","args":{"question":"How many posts went out on X today?"},"confidence":0.9}],"reply_summary":"Answer from today's numbers."}
"hello" -> {"actions":[{"type":"unknown","args":{},"confidence":0.9}],"reply_summary":"Nothing actionable."}`
}

export async function understandWithModel(
  router: Pick<LLMRouter, 'chat'>,
  mail: { subject: string; text: string },
  slots: string[],
  now = new Date(),
): Promise<Understood> {
  const format = zodToJsonSchema(LlmReplySchema, { target: 'openApi3' }) as Record<string, unknown>
  const body = `Subject: ${mail.subject.slice(0, 200)}\n\n${mail.text.slice(0, 3000)}`
  let content: string
  try {
    const res = await router.chat('triage', {
      messages: [
        { role: 'system', content: systemPrompt(slots, new Date(now.getTime() + 5 * 3600_000).toISOString().slice(0, 10)) },
        { role: 'user', content: `Email:\n"""\n${body}\n"""` },
      ],
      format,
      temperature: 0,
      timeoutMs: 90_000,
    })
    content = res.content
  } catch (e) {
    if (isQuotaExhausted(e)) throw new ModelUnavailable('model quota exhausted', true)
    throw new ModelUnavailable(`model call failed: ${e instanceof Error ? e.message : String(e)}`)
  }
  try {
    return validateReply(JSON.parse(content))
  } catch (e) {
    throw new ModelUnavailable(`model reply did not match the schema: ${e instanceof Error ? e.message.slice(0, 120) : 'invalid'}`)
  }
}

/**
 * The core commands without a model: status, pause, resume, video now <slot>, skip <slot>.
 * Reads the first non-empty line of the body, then the subject.
 */
export function keywordParse(mail: { subject: string; text: string }, slots: string[]): Understood | null {
  const lines = [...mail.text.split('\n'), mail.subject].map((l) => l.trim().toLowerCase().replace(/[.!?]+$/, '')).filter(Boolean)
  const tryLine = (l: string): Action | null => {
    if (/^(please )?(status|stats|report)( please)?$/.test(l)) return { type: 'status', args: {}, confidence: 1 }
    if (/^(please )?pause( (all|news|everything))?$/.test(l)) return { type: 'pause', args: {}, confidence: 1 }
    if (/^(please )?resume( (all|news|everything))?$/.test(l)) return { type: 'resume', args: {}, confidence: 1 }
    const v = /^(?:video now|video run|run video|post video)\s+([a-z0-9_-]+)$/.exec(l)
    if (v && slots.includes(v[1]!)) return { type: 'video_now', args: { slot: v[1]! }, confidence: 1 }
    const s = /^(?:skip|video skip|skip video)\s+([a-z0-9_-]+)$/.exec(l)
    if (s && slots.includes(s[1]!)) return { type: 'video_skip', args: { slot: s[1]! }, confidence: 1 }
    return null
  }
  // Only the first body line and the subject count: a command buried in prose is the model's job
  for (const l of [lines[0], lines[lines.length - 1]]) {
    const a = l ? tryLine(l) : null
    if (a) return { source: 'keyword', actions: [a], summary: `Keyword command: ${a.type}` }
  }
  return null
}

/** `CONFIRM ABC123` anywhere in the mail (checked before any model call) */
export function findConfirmCode(text: string): string | null {
  return /(?:^|\s)CONFIRM[\s:]+([A-Z0-9]{6})\b/i.exec(text)?.[1]?.toUpperCase() ?? null
}
