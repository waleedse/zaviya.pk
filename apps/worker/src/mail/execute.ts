import { randomInt } from 'node:crypto'
import type { Queue } from 'bullmq'
import type { PayloadClient } from '../payload-client.js'
import { editionKey, hhmm, postAtMs, runsOn, slotTimeMs, karachiDate, KARACHI_OFFSET_MS, type Slot } from '../video/schedule.js'
import type { Kv } from './kv.js'
import type { Linear } from './linear.js'
import type { Action } from './schema.js'

export const PENDING_TTL_SEC = 2 * 3600
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface PendingRetract {
  articleId: string
  title: string
  reason: string
  sender: string
  createdAt: string
}

export interface MailContext {
  sender: string
  subject: string
  /** Waleed's words, quoted in hand-offs */
  text: string
}

export interface ExecDeps {
  payload: Pick<PayloadClient, 'retract' | 'setDailyCap' | 'getSettings' | 'request'>
  kv: Kv
  slots: Slot[]
  controls: {
    pause(): Promise<void>
    resume(): Promise<void>
    isPaused(): boolean
    queueStats(): Promise<string>
  }
  videoQueue: Pick<Queue, 'add'>
  linear: Linear | null
  /** Answers a question from the status text with the cheap model; null when unavailable */
  answerer?: (question: string, statusText: string) => Promise<string | null>
  now(): number
  /** Dry run: read-only actions run, everything else only says what it would do */
  dry?: boolean
}

const dryNote = (s: string) => [`[dry run] would: ${s}`]

function newCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
}

// ---------- status ----------
export async function gatherStatus(deps: ExecDeps): Promise<string> {
  const now = deps.now()
  const out: string[] = []
  const section = async (title: string, fn: () => Promise<string[]>) => {
    try {
      out.push(`${title}`, ...(await fn()).map((l) => `  ${l}`), '')
    } catch (e) {
      out.push(`${title}`, `  unavailable: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`, '')
    }
  }

  await section('Pipeline', async () => {
    const s = await deps.payload.getSettings()
    const lines = [`state: ${deps.controls.isPaused() ? 'PAUSED' : 'running'}${s.killSwitch ? ' (kill switch on)' : ''}`]
    lines.push(`published today: ${s.articlesPublishedToday ?? '?'} of ${s.dailyCaps?.articles ?? '?'}`)
    if (s.lastPublishedAt) lines.push(`last published: ${s.lastPublishedAt}`)
    return lines
  })

  await section('Queues', async () => (await deps.controls.queueStats()).split('\n'))

  await section('Social posts today', async () => {
    const since = `${karachiDate(now)}T00:00:00+05:00`
    const res = await deps.payload.request<{ docs: { platform: string; status: string; error?: string | null; createdAt?: string }[] }>(
      'GET',
      `/api/social-posts?where[createdAt][greater_than_equal]=${encodeURIComponent(since)}&limit=500&depth=0&sort=-createdAt`,
    )
    const by: Record<string, { posted: number; failed: number; other: number }> = {}
    for (const d of res.docs) {
      const p = (by[d.platform] ??= { posted: 0, failed: 0, other: 0 })
      if (d.status === 'posted') p.posted++
      else if (d.status === 'failed') p.failed++
      else p.other++
    }
    const lines = ['facebook', 'instagram', 'x'].map((p) => {
      const c = by[p] ?? { posted: 0, failed: 0, other: 0 }
      return `${p}: ${c.posted} posted, ${c.failed} failed${c.other ? `, ${c.other} waiting` : ''}`
    })
    for (const p of Object.keys(by).filter((k) => !['facebook', 'instagram', 'x'].includes(k))) lines.push(`${p}: ${by[p]!.posted} posted, ${by[p]!.failed} failed`)
    const errors = res.docs.filter((d) => d.status === 'failed' && d.error).slice(0, 3)
    if (errors.length) lines.push('last failures:', ...errors.map((d) => `- ${d.platform}: ${String(d.error).replace(/\s+/g, ' ').slice(0, 140)}`))
    return lines
  })

  await section('Videos today', async () => {
    const weekday = new Date(now + KARACHI_OFFSET_MS).getUTCDay()
    const lines: string[] = []
    for (const s of deps.slots) {
      if (!runsOn(s, weekday)) continue
      const key = editionKey(s, now)
      const [done, skip] = await Promise.all([deps.kv.get(`video:done:${key}`), deps.kv.get(`video:skip:${key}`)])
      const at = slotTimeMs(s, now)
      const state = done ? `done (${done})` : skip ? 'skip requested' : now < at ? `due ${hhmm(at)}, posts about ${hhmm(postAtMs(s, at, 20))} PKT` : 'rendering or not run yet'
      lines.push(`${s.name} ${hhmm(at)} ${s.format}: ${state}`)
    }
    return lines.length ? lines : ['no video slots today']
  })

  return out.join('\n').trim()
}

// ---------- retract ----------
async function resolveArticle(deps: ExecDeps, args: { articleId?: string; url?: string }): Promise<{ id: string; title: string } | null> {
  if (args.articleId) {
    const doc = await deps.payload
      .request<{ id: string | number; title?: string }>('GET', `/api/articles/${encodeURIComponent(args.articleId)}?depth=0&locale=en`)
      .catch(() => null)
    return doc ? { id: String(doc.id), title: String(doc.title ?? args.articleId) } : null
  }
  let slug = ''
  try {
    slug = decodeURIComponent(new URL(args.url!).pathname.split('/').filter(Boolean).pop() ?? '')
  } catch {
    slug = ''
  }
  if (!slug) return null
  for (const locale of ['en', 'ur']) {
    const res = await deps.payload
      .request<{ docs: { id: string | number; title?: string }[] }>('GET', `/api/articles?where[slug][equals]=${encodeURIComponent(slug)}&locale=${locale}&limit=2&depth=0`)
      .catch(() => null)
    if (res?.docs.length === 1) return { id: String(res.docs[0]!.id), title: String(res.docs[0]!.title ?? slug) }
    if (res && res.docs.length > 1) return null // ambiguous: never guess which article to take down
  }
  return null
}

async function startRetract(a: Extract<Action, { type: 'retract' }>, ctx: MailContext, deps: ExecDeps): Promise<string[]> {
  const article = await resolveArticle(deps, a.args)
  if (!article) return [`Retract: I could not find exactly one article for ${a.args.articleId ?? a.args.url}. Nothing was changed.`]
  if (deps.dry) return dryNote(`ask you to confirm retracting "${article.title}" (article ${article.id})`)
  const code = newCode()
  const pending: PendingRetract = { articleId: article.id, title: article.title, reason: a.args.reason, sender: ctx.sender, createdAt: new Date(deps.now()).toISOString() }
  await deps.kv.set(`mailcmd:pending:${code}`, JSON.stringify(pending), PENDING_TTL_SEC)
  return [
    `Retract: NOT done yet. "${article.title}" (article ${article.id}) will be taken down, reason: ${a.args.reason}.`,
    `To go ahead reply with:  CONFIRM ${code}`,
    'The code works for 2 hours, once.',
  ]
}

export async function confirmRetract(code: string, ctx: MailContext, deps: ExecDeps): Promise<string[]> {
  const raw = await deps.kv.get(`mailcmd:pending:${code}`)
  if (!raw) return [`CONFIRM ${code}: that code is unknown, already used or older than 2 hours. Ask for the retract again.`]
  const p = JSON.parse(raw) as PendingRetract
  if (p.sender !== ctx.sender) return [`CONFIRM ${code}: that code was issued to another sender. Nothing was changed.`]
  if (deps.dry) return dryNote(`retract "${p.title}" (article ${p.articleId})`)
  await deps.kv.del(`mailcmd:pending:${code}`)
  try {
    const res = await deps.payload.retract(p.articleId, `Email command: ${p.reason}`)
    const social = res.socialPosts.length
      ? ` It had ${res.socialPosts.length} social post(s) (${res.socialPosts.map((s) => s.platform).join(', ')}); they were not deleted from the platforms.`
      : ''
    return [`Retracted "${p.title}" (article ${p.articleId}); it is now a draft off the site.${social}`]
  } catch (e) {
    await deps.kv.set(`mailcmd:pending:${code}`, raw, PENDING_TTL_SEC)
    return [`Retract failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}. The code still works; reply CONFIRM ${code} to try again.`]
  }
}

// ---------- dispatcher ----------
function findSlot(deps: ExecDeps, name: string): { slot?: Slot; error?: string } {
  const slot = deps.slots.find((s) => s.name === name.toLowerCase())
  if (!slot) return { error: `unknown video slot "${name}" (slots: ${deps.slots.map((s) => s.name).join(', ')})` }
  if (!runsOn(slot, new Date(deps.now() + KARACHI_OFFSET_MS).getUTCDay())) return { error: `slot "${name}" does not run today` }
  return { slot }
}

export async function executeAction(action: Action, ctx: MailContext, deps: ExecDeps): Promise<string[]> {
  switch (action.type) {
    case 'status':
      return (await gatherStatus(deps)).split('\n')

    case 'answer': {
      const status = await gatherStatus(deps)
      const answer = await deps.answerer?.(action.args.question, status).catch(() => null)
      return answer ? [answer] : [`I could not phrase an answer with the model, so here are today's numbers:`, '', ...status.split('\n')]
    }

    case 'pause':
      if (deps.dry) return dryNote('pause the news pipeline')
      await deps.controls.pause()
      return ['Paused the news pipeline queues (ingest to social). Video posts follow their own schedule. Reply "resume" to start again.']

    case 'resume':
      if (deps.dry) return dryNote('resume the news pipeline')
      await deps.controls.resume()
      return ['Resumed the news pipeline queues.']

    case 'video_now': {
      const { slot, error } = findSlot(deps, action.args.slot)
      if (!slot) return [`Video: ${error}. Nothing was started.`]
      const key = editionKey(slot, deps.now())
      const done = await deps.kv.get(`video:done:${key}`)
      if (done) return [`Video ${key} is already ${done} today. Nothing was started.`]
      if (deps.dry) return dryNote(`render and post video ${key} now`)
      await deps.kv.del(`video:skip:${key}`)
      // jobId carries the time so a second request later is not swallowed as a duplicate
      await deps.videoQueue.add('run', { slot: slot.name, now: true }, { jobId: `mailcmd-${key}-${Math.floor(deps.now() / 60_000)}`, removeOnComplete: true, removeOnFail: 50 })
      return [`Queued video ${key} to render and post now (it takes a few minutes; the Telegram preview shows when it starts).`]
    }

    case 'video_skip': {
      const { slot, error } = findSlot(deps, action.args.slot)
      if (!slot) return [`Video: ${error}. Nothing was changed.`]
      const key = editionKey(slot, deps.now())
      if (deps.dry) return dryNote(`skip video ${key}`)
      await deps.kv.set(`video:skip:${key}`, '1', 6 * 3600)
      return [`Video ${key} will be skipped (the skip flag lasts 6 hours).`]
    }

    case 'retract':
      return startRetract(action, ctx, deps)

    case 'set_cap': {
      if (deps.dry) return dryNote(`set the ${action.args.platform} cap to ${action.args.perDay} a day`)
      try {
        await deps.payload.setDailyCap(action.args.platform, action.args.perDay)
        return [`Daily cap for ${action.args.platform} is now ${action.args.perDay}.`]
      } catch (e) {
        return [`Could not set the ${action.args.platform} cap: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}. Nothing was changed.`]
      }
    }

    case 'handoff': {
      const { agent, title, details, contentOrSeo } = action.args
      const pmApproved = (agent === 'seo' || agent === 'editor') && contentOrSeo
      const description = [
        `Request from Waleed by email${ctx.subject ? ` (subject: ${ctx.subject})` : ''}:`,
        '',
        ...ctx.text.slice(0, 3000).split('\n').map((l) => `> ${l}`),
        '',
        details ? `Summary: ${details}` : '',
        '',
        '— 🤖 Zaviya email commands',
      ].join('\n')
      if (deps.dry) return dryNote(`hand "${title}" to the ${agent} agent${pmApproved ? ' (pm-approved)' : ''}`)
      if (!deps.linear) {
        return [`Hand-off to ${agent} FAILED: LINEAR_API_KEY is not set on the server. Nothing was created. Your request, to forward by hand:`, `  ${title}`, ...(details ? [`  ${details}`] : [])]
      }
      try {
        const issue = await deps.linear.createIssue({ agent, title, description, pmApproved })
        return [`Handed to the ${agent} agent as ${issue.identifier}${pmApproved ? ' (pm-approved)' : ''}: ${title}`, issue.url]
      } catch (e) {
        return [`Hand-off to ${agent} FAILED: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}. Your request, to forward by hand:`, `  ${title}`, ...(details ? [`  ${details}`] : [])]
      }
    }

    case 'unknown':
      return []
  }
}
