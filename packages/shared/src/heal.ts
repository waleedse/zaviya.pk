/**
 * Extension "eyes": the pieces the browser extension and the worker share when a job gets stuck on a page.
 *
 * The extension sends what it sees (screenshot, clickable elements, dialogs); the worker (or, offline, the rules in
 * this file) picks ONE action from a fixed list; the extension performs it. Everything that keeps this safe lives
 * here and runs on BOTH sides: the model can only ask, the allow-list decides.
 */
import { z } from 'zod'

export type HealPlatform = 'x' | 'instagram' | 'gemini'

export const HEAL_LIMITS = {
  /** Heal attempts per job */
  perJob: 2,
  /** Heal attempts per hour across all jobs */
  perHour: 6,
  /** At most one "I need you" email per platform in this window */
  emailWindowMs: 2 * 60 * 60_000,
} as const

export const HEAL_ACTIONS = ['click', 'press_escape', 'reload_tab', 'scroll_top', 'give_up'] as const
export type HealActionName = (typeof HEAL_ACTIONS)[number]

// ---------- wire shapes ----------

export const HealElementSchema = z.object({
  i: z.number().int().min(0),
  tag: z.string().max(20),
  text: z.string().max(200),
  ariaLabel: z.string().max(200).default(''),
  /** Absolute href for links, empty for buttons */
  href: z.string().max(500).default(''),
  /** Bounding-box centre in CSS pixels of the viewport */
  x: z.number(),
  y: z.number(),
  inDialog: z.boolean().default(false),
  visible: z.boolean().default(true),
})
export type HealElement = z.infer<typeof HealElementSchema>

/** What the extension sees on the stuck page (collected in the page, see the extension's heal-collect.ts) */
export const PageStateSchema = z.object({
  url: z.string().max(1000),
  title: z.string().max(300).default(''),
  elements: z.array(HealElementSchema).max(80),
  dialogs: z.array(z.string().max(600)).max(8).default([]),
  toasts: z.array(z.string().max(300)).max(8).default([]),
  /** First few hundred characters of visible text: enough to spot a login wall */
  pageText: z.string().max(800).default(''),
})
export type PageState = z.infer<typeof PageStateSchema>

/** Extension -> worker: "a job failed, here is what I see" */
export const HealRequestSchema = PageStateSchema.extend({
  type: z.literal('heal.request'),
  /** Correlates the heal.action reply */
  id: z.string(),
  jobId: z.string(),
  jobType: z.string(),
  platform: z.enum(['x', 'instagram', 'gemini']),
  error: z.string().max(2000),
  /** 1 or 2 */
  attempt: z.number().int().min(1).max(5).default(1),
  /** base64 JPEG, absent when the screenshot could not be taken */
  screenshot: z.string().max(6_000_000).optional(),
})
export type HealRequest = z.infer<typeof HealRequestSchema>

/** What the model may answer (strict): the diagnosis plus one action from the fixed list */
export const HealDecisionSchema = z.object({
  diagnosis: z.string().max(400),
  action: z.enum(HEAL_ACTIONS),
  elementIndex: z.number().int().min(0).optional(),
  needsHuman: z.boolean().default(false),
  humanReason: z.string().max(300).optional(),
})
export type HealDecision = z.infer<typeof HealDecisionSchema>

/** Worker -> extension */
export const HealActionMessageSchema = HealDecisionSchema.extend({
  type: z.literal('heal.action'),
  id: z.string(),
  source: z.enum(['llm', 'rules']).default('rules'),
})
export type HealActionMessage = z.infer<typeof HealActionMessageSchema>

export const HealResultSchema = z.enum(['retry_ok', 'retry_failed', 'not_retried', 'refused', 'needs_human', 'limit_reached'])
export type HealResult = z.infer<typeof HealResultSchema>

/** Extension -> worker: how it went, for the log and for the "I need you" email */
export const HealReportSchema = z.object({
  type: z.literal('heal.report'),
  id: z.string(),
  jobId: z.string(),
  jobType: z.string(),
  platform: z.enum(['x', 'instagram', 'gemini']),
  error: z.string().max(2000),
  diagnosis: z.string().max(400),
  /** e.g. 'click "Not now"' */
  action: z.string().max(200),
  result: HealResultSchema,
  needsHuman: z.boolean().default(false),
  humanReason: z.string().max(300).optional(),
  /** No more heal attempts will be made for this job */
  final: z.boolean().default(false),
  url: z.string().max(1000).default(''),
  screenshot: z.string().max(6_000_000).optional(),
})
export type HealReport = z.infer<typeof HealReportSchema>

// ---------- which jobs and errors are worth healing ----------

export function healPlatform(jobType: string): HealPlatform | null {
  if (jobType.startsWith('x.')) return 'x'
  if (jobType.startsWith('instagram.')) return 'instagram'
  if (jobType === 'gemini.image') return 'gemini'
  return null
}

/** Errors that are decisions or rules, not a stuck page: no point looking at a screenshot */
const NOT_HEALABLE = /^(platform_disabled|unknown_job|unknown_action|missing_\w+|instagram_requires_media|instagram_media_upload_not_implemented|gemini_user_\w+|gemini_limit_reached|gemini_refused|gemini_bad_data_url|bridge not connected)/

export function isHealableError(error: string): boolean {
  return !NOT_HEALABLE.test(error.trim())
}

/**
 * May the job be run again after a heal? Reading is always safe. A post whose outcome is unknown (the page never
 * answered) could already be live, so it is not repeated: a duplicate post is worse than a failed one.
 */
export function isRetrySafe(jobType: string, error: string): boolean {
  if (!/\.post$/.test(jobType)) return true
  return /^(composer_not_found|post_button_not_found|post_not_sent|instagram_create_not_found)/.test(error.trim())
}

// ---------- the allow-list ----------

/** Visible text (or aria-label) of buttons and links the healer may click: exact or startsWith, case-insensitive */
export const ALLOWED_CLICK_LABELS = [
  'close',
  'cancel',
  'not now',
  'skip',
  'skip for now',
  'got it',
  'ok',
  'dismiss',
  'discard',
  'leave',
  'try again',
  'retry',
  'reload',
  'refresh',
  'continue',
  'maybe later',
  'no thanks',
  // cookie banners: decline or close only, never accept
  'decline',
  'reject',
  'refuse',
  'x',
  '×',
] as const

/** Matched as word starts anywhere in the label (so "subscription" and "deleted" count): a label containing one is never clicked */
const DENIED_WORDS = [
  'post', 'posts', 'send', 'delet', 'remov', 'log out', 'logout', 'sign out', 'log in', 'login', 'sign in', 'sign up', 'subscri',
  'buy', 'purchas', 'pay', 'premium', 'upgrad', 'verif', 'follow', 'unfollow', 'block', 'report', 'mute', 'accept', 'allow',
  'agree', 'confirm', 'submit', 'share', 'tweet', 'reply', 'repost', 'retweet', 'like', 'turn on', 'enabl', 'install', 'download',
  'creat', 'publish', 'schedul', 'save', 'add', 'join', 'group', 'community', 'account', 'password',
  // third-party sign-in buttons start with an allowed word ("Continue with Google")
  'continue with', 'with google', 'with apple', 'with facebook', 'google', 'apple',
]
const DENIED_RE = new RegExp(`(^|[^\\p{L}\\p{N}])(${DENIED_WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|')})`, 'iu')

/** Paths of links the healer must never follow even inside the platform */
const DENIED_PATH_RE = /(logout|signout|sign_out|premium|subscribe|settings|compose|delete|checkout|billing|\/i\/flow\/(login|signup))/i

const PLATFORM_HOSTS: Record<HealPlatform, RegExp> = {
  x: /^(www\.|mobile\.)?(x|twitter)\.com$/i,
  instagram: /^(www\.)?instagram\.com$/i,
  gemini: /^gemini\.google\.com$/i,
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[.!…]+$/, '')

function oneLabelAllowed(raw: string): boolean {
  const label = norm(raw)
  if (!label || label.length > 40) return false
  if (DENIED_RE.test(label)) return false
  return ALLOWED_CLICK_LABELS.some((a) => {
    // 'x' and the multiplication sign must stand alone ("X Premium" is a different button)
    if (a === 'x' || a === '×') return label === a
    return label === a || label.startsWith(`${a} `)
  })
}

/** A control may be clicked when its visible text and/or aria-label pass the allow-list and neither is denied */
export function labelAllowed(text: string, ariaLabel = ''): boolean {
  const parts = [text, ariaLabel].filter((s) => norm(s))
  if (!parts.length) return false
  if (parts.some((p) => DENIED_RE.test(norm(p)))) return false
  return parts.some(oneLabelAllowed)
}

/** Empty href is fine (a button); a link must stay on the platform and off account/billing paths */
export function hrefAllowed(href: string, platform: HealPlatform): boolean {
  if (!href) return true
  let u: URL
  try {
    u = new URL(href)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  if (!PLATFORM_HOSTS[platform].test(u.hostname)) return false
  return !DENIED_PATH_RE.test(u.pathname)
}

export type Validated = { ok: true; action: HealDecision; element?: HealElement } | { ok: false; reason: string }

/** The one gate between a model's (or the rules') answer and the browser */
export function validateAction(decision: unknown, req: Pick<PageState, 'elements'> & { platform: HealPlatform }): Validated {
  const parsed = HealDecisionSchema.safeParse(decision)
  if (!parsed.success) return { ok: false, reason: 'schema' }
  const d = parsed.data
  if (d.action !== 'click') return { ok: true, action: d }
  if (d.elementIndex === undefined) return { ok: false, reason: 'click without elementIndex' }
  const el = req.elements.find((e) => e.i === d.elementIndex)
  if (!el) return { ok: false, reason: `no element ${d.elementIndex}` }
  if (!el.visible) return { ok: false, reason: 'element not visible' }
  if (!labelAllowed(el.text, el.ariaLabel)) return { ok: false, reason: `"${(el.text || el.ariaLabel).slice(0, 40)}" is not on the allow-list` }
  if (!hrefAllowed(el.href, req.platform)) return { ok: false, reason: 'link leaves the platform or is on a denied path' }
  return { ok: true, action: d, element: el }
}

// ---------- rate limits ----------

export interface HealHistory {
  /** Times (ms) of every heal attempt in the last hour or more */
  attempts: number[]
}

export function checkHealLimit(history: HealHistory, jobAttemptsSoFar: number, now: number): { ok: true } | { ok: false; reason: 'job_limit' | 'hour_limit' } {
  if (jobAttemptsSoFar >= HEAL_LIMITS.perJob) return { ok: false, reason: 'job_limit' }
  const lastHour = history.attempts.filter((t) => now - t < 60 * 60_000).length
  if (lastHour >= HEAL_LIMITS.perHour) return { ok: false, reason: 'hour_limit' }
  return { ok: true }
}

// ---------- rules (used when the model is unavailable) ----------

const HUMAN_URL_RE = /(\/login|\/i\/flow\/login|accounts\/login|\/challenge|\/checkpoint|\/suspended|accounts\.google\.com|\/signin|\/i\/flow\/signup)/i
const HUMAN_TEXT: { re: RegExp; reason: string }[] = [
  { re: /captcha|i'?m not a robot|are you a robot|prove you'?re human|arkose|verify you are human/i, reason: 'a captcha is showing' },
  { re: /(account|profile).{0,30}(locked|suspended|restricted|disabled)|temporarily locked|we suspended your account/i, reason: 'the account is locked or suspended' },
  { re: /unusual (login )?activity|confirm it'?s you|two-?factor|verification code|security code|enter your password|suspicious/i, reason: 'a security check wants a person' },
  { re: /(log ?in|sign ?in) to (x|twitter|instagram|continue|your account)|^\s*log in\b|welcome back/im, reason: 'the account is logged out' },
]

/** Login, captcha, 2FA and locked accounts always mean "ask a person"; returns the reason or null */
export function detectNeedsHuman(state: Pick<PageState, 'url' | 'dialogs' | 'toasts' | 'pageText'>): string | null {
  const text = [...state.dialogs, ...state.toasts, state.pageText].join('\n')
  for (const { re, reason } of HUMAN_TEXT) if (re.test(text)) return reason
  if (HUMAN_URL_RE.test(state.url)) return 'the browser is on a login or security page'
  return null
}

/** Best first. "Leave" and "Discard" come first: they free a tab stuck on an unsent draft. */
const RULE_ORDER = [
  'leave', 'discard', 'try again', 'retry', 'reload', 'refresh', 'not now', 'skip for now', 'skip', 'maybe later', 'no thanks',
  'decline', 'reject', 'refuse', 'got it', 'dismiss', 'close', 'ok', 'cancel', '×', 'x', 'continue',
]

function rank(el: HealElement): number {
  const label = norm(el.text) || norm(el.ariaLabel)
  const idx = RULE_ORDER.findIndex((a) => label === a || label.startsWith(`${a} `))
  return idx < 0 ? 99 : idx
}

/**
 * Rule-based decision for known hurdles. Used when the model is out of quota or unreachable, and by the extension
 * when the worker does not answer in time.
 */
export function ruleDecision(req: Pick<PageState, 'url' | 'dialogs' | 'toasts' | 'pageText' | 'elements'> & { platform: HealPlatform }): HealDecision {
  const human = detectNeedsHuman(req)
  if (human) return { diagnosis: `Needs a person: ${human}`, action: 'give_up', needsHuman: true, humanReason: human }

  const allText = [...req.dialogs, ...req.toasts].join(' ')
  const usable = req.elements
    .filter((e) => e.visible && labelAllowed(e.text, e.ariaLabel) && hrefAllowed(e.href, req.platform))
    .map((e) => ({ e, r: rank(e) }))
    .filter((c) => c.r < 99)

  const errorPage = /something went wrong|try again|couldn'?t load|unexpected error|error occurred/i.test(allText + ' ' + req.pageText)
  const dialogButtons = usable.filter((c) => c.e.inDialog).sort((a, b) => a.r - b.r)
  // "Continue" in a dialog about signing in or switching account would leave the page's purpose behind
  const safeDialog = dialogButtons.filter((c) => !(norm(c.e.text).startsWith('continue') && /log ?in|sign ?in|as \w+/i.test(allText)))

  if (safeDialog[0]) {
    const el = safeDialog[0].e
    return { diagnosis: `A dialog is in the way (${(req.dialogs[0] ?? '').slice(0, 100)})`, action: 'click', elementIndex: el.i, needsHuman: false }
  }
  if (errorPage) {
    const retry = usable.filter((c) => c.r <= 5).sort((a, b) => a.r - b.r)[0]
    if (retry) return { diagnosis: 'The page shows an error with a retry button', action: 'click', elementIndex: retry.e.i, needsHuman: false }
    return { diagnosis: 'The page shows an error and no retry button', action: 'reload_tab', needsHuman: false }
  }
  const banner = usable.filter((c) => !c.e.inDialog && c.r >= 10 && c.r <= 11).sort((a, b) => a.r - b.r)[0] // decline / reject
  if (banner) return { diagnosis: 'A cookie banner is showing; declining it', action: 'click', elementIndex: banner.e.i, needsHuman: false }
  if (req.dialogs.length) return { diagnosis: 'A dialog is open with no safe button; pressing Escape', action: 'press_escape', needsHuman: false }
  return { diagnosis: 'Nothing known is blocking the page', action: 'give_up', needsHuman: false }
}

/** Short human text for the log and the error line, e.g. 'click "Not now"' */
export function describeAction(d: HealDecision, el?: HealElement): string {
  if (d.action === 'click') return `click "${(el?.text || el?.ariaLabel || `#${d.elementIndex}`).slice(0, 40)}"`
  return d.action
}

/** The instruction for the email, by platform and reason */
export function humanInstruction(platform: HealPlatform, reason: string): string {
  const site = platform === 'x' ? 'x.com' : platform === 'instagram' ? 'instagram.com' : 'gemini.google.com'
  if (/log(ged)? ?(in|out)|login|sign/i.test(reason)) return `Open ${site} in Chrome (the profile that has the Zaviya extension) and log in again.`
  if (/captcha/i.test(reason)) return `Open ${site} in Chrome and solve the captcha. The extension never touches captchas.`
  if (/lock|suspend|restrict|disabled/i.test(reason)) return `Open ${site} in Chrome and look at the account notice. The account may need to be unlocked by you before posting can continue.`
  if (/security|verif|code|2fa/i.test(reason)) return `Open ${site} in Chrome and finish the security check it is asking for.`
  return `Open ${site} in Chrome, look at what is on the screen (see the attached screenshot) and clear it by hand.`
}
