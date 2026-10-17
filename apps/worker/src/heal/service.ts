import type { LLMRouter } from '@zaviya/llm'
import {
  HEAL_LIMITS,
  checkHealLimit,
  detectNeedsHuman,
  humanInstruction,
  ruleDecision,
  validateAction,
  type HealActionMessage,
  type HealDecision,
  type HealReport,
  type HealRequest,
} from '@zaviya/shared'
import type { Kv } from '../mail/kv.js'
import type { Mailer, OutgoingMail } from '../mail/transport.js'

/** Strict answer format for the vision model; the same shape HealDecisionSchema enforces afterwards */
export const HEAL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    diagnosis: { type: 'string', description: 'One or two sentences: what is blocking the page' },
    action: { type: 'string', enum: ['click', 'press_escape', 'reload_tab', 'scroll_top', 'give_up'] },
    elementIndex: { type: 'integer', description: 'The index "i" of the element to click; only with action click' },
    needsHuman: { type: 'boolean', description: 'true for login, captcha, 2FA, locked or suspended accounts' },
    humanReason: { type: 'string', description: 'Only when needsHuman: why a person is needed' },
  },
  required: ['diagnosis', 'action', 'needsHuman'],
}

const SYSTEM = `You help a browser automation get past a hurdle on a website. You get a screenshot of the page, the list of clickable elements (with an index "i") and the texts of dialogs and toasts. The job failed with the error given.

Answer with JSON only: {diagnosis, action, elementIndex?, needsHuman, humanReason?}.

action is exactly one of:
- "click": click ONE element from the list by its index. Only to close or dismiss something in the way (Close, Cancel, Not now, Skip, Got it, OK, Dismiss, Discard, Leave, Try again, Retry, Reload, Refresh, Continue, Maybe later, No thanks, an X button) or to decline a cookie banner.
- "press_escape": close a dialog or menu that has no safe button.
- "reload_tab": the page is broken or shows "Something went wrong" with no retry button.
- "scroll_top": the page is scrolled somewhere the needed control cannot be seen.
- "give_up": nothing known is in the way.

Rules you must follow:
- Never choose Post, Send, Delete, Log out, Subscribe, Buy, Premium, Verify, Follow, Block, Report, Accept, Allow, or any link that leaves the site. You cannot type anything.
- A login page, captcha, two-factor prompt, "verify it's you" or a locked/suspended account is needsHuman=true with action "give_up". Never try to get past those.
- Prefer the dialog on top over anything behind it. When unsure, "give_up" is better than a wrong click.`

function describePage(req: HealRequest): string {
  const els = req.elements
    .slice(0, 60)
    .map((e) => `[${e.i}] <${e.tag}> "${e.text.slice(0, 60)}"${e.ariaLabel ? ` aria="${e.ariaLabel.slice(0, 40)}"` : ''}${e.inDialog ? ' (in dialog)' : ''}${e.href ? ` -> ${safeHost(e.href)}` : ''}`)
    .join('\n')
  return [
    `Platform: ${req.platform}. Job: ${req.jobType}. Error: ${req.error}`,
    `URL: ${req.url}`,
    req.dialogs.length ? `Dialogs:\n${req.dialogs.map((d) => `- ${d.replace(/\s+/g, ' ')}`).join('\n')}` : 'Dialogs: none',
    req.toasts.length ? `Toasts: ${req.toasts.join(' | ')}` : '',
    `Page text starts: ${req.pageText.replace(/\s+/g, ' ').slice(0, 300)}`,
    `Clickable elements:\n${els || '(none)'}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function safeHost(href: string): string {
  try {
    const u = new URL(href)
    return `${u.hostname}${u.pathname.slice(0, 30)}`
  } catch {
    return 'invalid-url'
  }
}

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(t)
}

export interface HealServiceDeps {
  router: Pick<LLMRouter, 'chat'>
  /** null when OPS_MAIL_USER / OPS_MAIL_PASSWORD are not set: heals are logged but nobody is emailed */
  mailer: Mailer | null
  kv: Kv
  to: string
  log: (obj: Record<string, unknown>, msg: string) => void
  now?: () => number
}

export function createHealService(deps: HealServiceDeps) {
  const now = deps.now ?? Date.now
  const attempts: number[] = []
  const perJob = new Map<string, number>()
  const recent: { at: string; jobType: string; platform: string; diagnosis: string; action: string; result: string }[] = []

  /** The extension sends what it sees; the answer is always one allowed action, never free text to execute */
  async function decide(req: HealRequest): Promise<HealActionMessage> {
    const reply = (d: HealDecision, source: 'llm' | 'rules'): HealActionMessage => ({ type: 'heal.action', id: req.id, source, ...d })

    // The server counts too, so a misbehaving extension cannot spend more than the limits
    const limit = checkHealLimit({ attempts }, perJob.get(req.jobId) ?? 0, now())
    if (!limit.ok) {
      return reply({ diagnosis: `Heal limit reached (${limit.reason})`, action: 'give_up', needsHuman: false }, 'rules')
    }
    attempts.push(now())
    perJob.set(req.jobId, (perJob.get(req.jobId) ?? 0) + 1)
    if (perJob.size > 500) perJob.delete(perJob.keys().next().value!)

    const human = detectNeedsHuman(req)
    if (human) return reply({ diagnosis: `Needs a person: ${human}`, action: 'give_up', needsHuman: true, humanReason: human }, 'rules')

    try {
      const res = await deps.router.chat('vision', {
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: describePage(req),
            images: req.screenshot ? [{ mimeType: 'image/jpeg', base64: req.screenshot }] : undefined,
          },
        ],
        format: HEAL_JSON_SCHEMA,
        temperature: 0,
        maxTokens: 600,
        timeoutMs: 30_000,
      })
      const v = validateAction(parseJson(res.content), req)
      if (v.ok) {
        const d = v.action.needsHuman ? { ...v.action, action: 'give_up' as const, elementIndex: undefined } : v.action
        return reply(d, 'llm')
      }
      deps.log({ jobType: req.jobType, reason: v.reason }, 'heal: model answer refused by the allow-list, using rules')
      const fb = ruleDecision(req)
      return reply({ ...fb, diagnosis: `${fb.diagnosis} (model answer refused: ${v.reason})` }, 'rules')
    } catch (e) {
      deps.log({ err: e instanceof Error ? e.message : String(e) }, 'heal: model unavailable, using rules')
      return reply(ruleDecision(req), 'rules')
    }
  }

  async function report(r: HealReport): Promise<void> {
    recent.unshift({ at: new Date(now()).toISOString(), jobType: r.jobType, platform: r.platform, diagnosis: r.diagnosis, action: r.action, result: r.result })
    recent.length = Math.min(recent.length, 50)
    deps.log({ job: r.jobId, jobType: r.jobType, platform: r.platform, diagnosis: r.diagnosis, action: r.action, result: r.result, needsHuman: r.needsHuman }, 'heal')

    const wantsHuman = r.needsHuman || r.result === 'limit_reached' || (r.final && r.result !== 'retry_ok')
    if (!wantsHuman) return
    if (!deps.mailer) {
      deps.log({ platform: r.platform }, 'heal: needs a person but no ops mailbox is configured')
      return
    }
    // One email per platform per 2 hours (atomic, so two reports cannot both send)
    const first = await deps.kv.set(`heal:email:${r.platform}`, String(now()), Math.ceil(HEAL_LIMITS.emailWindowMs / 1000), { nx: true })
    if (!first) return
    try {
      await deps.mailer.send(buildHumanEmail(r, deps.to))
    } catch (e) {
      await deps.kv.del(`heal:email:${r.platform}`).catch(() => undefined)
      deps.log({ err: e instanceof Error ? e.message : String(e) }, 'heal: could not send the email')
    }
  }

  return { decide, report, recent: () => [...recent] }
}

export function buildHumanEmail(r: HealReport, to: string): OutgoingMail {
  const site = r.platform === 'x' ? 'X' : r.platform === 'instagram' ? 'Instagram' : 'Gemini'
  const why = r.humanReason ?? (r.result === 'limit_reached' ? 'the self-heal limit was reached' : 'the automatic fixes did not work')
  const body = [
    `The Zaviya extension is stuck on ${site} and needs you.`,
    '',
    `What to do: ${humanInstruction(r.platform, r.humanReason ?? r.diagnosis)}`,
    '',
    `Why: ${why}`,
    `What it saw: ${r.diagnosis}`,
    `What it tried: ${r.action} (${r.result.replace(/_/g, ' ')})`,
    `Job: ${r.jobType}`,
    `Error: ${r.error}`,
    r.url ? `Page: ${r.url}` : '',
    '',
    r.screenshot ? 'The screenshot is attached.' : 'No screenshot could be taken.',
    'You get at most one of these per platform every 2 hours.',
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n')
  return {
    to,
    subject: `Zaviya needs you: ${site} is stuck${r.needsHuman ? '' : ' (auto-fix failed)'}`,
    body,
    attachments: r.screenshot ? [{ filename: `${r.platform}-screen.jpg`, contentType: 'image/jpeg', base64: r.screenshot }] : undefined,
  }
}

