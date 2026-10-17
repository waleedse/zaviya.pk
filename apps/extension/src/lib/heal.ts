import {
  HEAL_LIMITS,
  HealActionMessageSchema,
  checkHealLimit,
  describeAction,
  detectNeedsHuman,
  healPlatform,
  hrefAllowed,
  isHealableError,
  isRetrySafe,
  labelAllowed,
  ruleDecision,
  validateAction,
  type BridgeJob,
  type HealActionMessage,
  type HealDecision,
  type HealElement,
  type HealPlatform,
  type HealReport,
  type HealRequest,
  type HealResult,
  type PageState,
} from '@zaviya/shared'
import { collectInPage } from './heal-collect'
import { findHealTab, navigateLeavingDrafts } from './tabs'
import { runTrustedInput } from './trusted-input'

/**
 * The extension's "eyes". When a job fails on X, Instagram or Gemini it looks at the page (screenshot plus the
 * clickable elements), asks the worker what to do, performs ONE allow-listed action and retries the job once.
 * Safety does not depend on the model: every action is checked again here against the allow-list in @zaviya/shared,
 * and a click is re-verified against the live page right before it happens.
 */

const LOG_KEY = 'healLog'
const ATTEMPTS_KEY = 'healAttempts'
const LOG_SIZE = 10
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

export interface HealLogEntry {
  at: number
  jobType: string
  platform: HealPlatform
  diagnosis: string
  action: string
  result: HealResult
}

/** What the healer needs from the connection to the worker */
export interface HealLink {
  /** Resolves null when the worker is offline or does not answer in time */
  requestHeal(req: HealRequest, timeoutMs?: number): Promise<HealActionMessage | null>
  sendReport(report: HealReport): void
}

// ---------- storage: last 10 heals and the hourly counter ----------

export async function readHealLog(): Promise<HealLogEntry[]> {
  try {
    return ((await chrome.storage.local.get(LOG_KEY))[LOG_KEY] as HealLogEntry[] | undefined) ?? []
  } catch {
    return []
  }
}

async function appendHealLog(entry: HealLogEntry): Promise<void> {
  try {
    const log = await readHealLog()
    await chrome.storage.local.set({ [LOG_KEY]: [entry, ...log].slice(0, LOG_SIZE) })
  } catch {
    /* the log is a convenience */
  }
}

async function recentAttempts(): Promise<number[]> {
  try {
    const all = ((await chrome.storage.local.get(ATTEMPTS_KEY))[ATTEMPTS_KEY] as number[] | undefined) ?? []
    return all.filter((t) => Date.now() - t < 60 * 60_000)
  } catch {
    return []
  }
}

async function recordAttempt(): Promise<void> {
  const all = await recentAttempts()
  await chrome.storage.local.set({ [ATTEMPTS_KEY]: [...all, Date.now()] }).catch(() => undefined)
}

// ---------- seeing ----------

export async function collectState(tabId: number): Promise<PageState | undefined> {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: collectInPage })
    return res?.result as PageState | undefined
  } catch {
    return undefined
  }
}

/** JPEG of the tab through the debugger, so a background tab works. Undefined when the debugger is busy. */
export async function captureScreenshot(tabId: number): Promise<string | undefined> {
  const target = { tabId }
  try {
    await chrome.debugger.attach(target, '1.3')
  } catch {
    return undefined
  }
  try {
    const metrics = (await chrome.debugger.sendCommand(target, 'Page.getLayoutMetrics')) as { cssVisualViewport?: { clientWidth: number; clientHeight: number } }
    const w = metrics.cssVisualViewport?.clientWidth ?? 1280
    const h = metrics.cssVisualViewport?.clientHeight ?? 800
    const shot = (await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
      format: 'jpeg',
      quality: 60,
      fromSurface: true,
      clip: { x: 0, y: 0, width: w, height: h, scale: Math.min(1, 1280 / w) },
    })) as { data?: string }
    return shot.data
  } catch {
    return undefined
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined)
  }
}

// ---------- acting ----------

/** Runs in the page: the control that really sits at a point, to compare with what we were told */
function controlAtPoint(x: number, y: number): { text: string; ariaLabel: string; href: string } | null {
  const hit = document.elementFromPoint(x, y)
  const c = hit?.closest('button, a[href], [role="button"], input[type="button"], input[type="submit"], [role="menuitem"]') as HTMLElement | null
  if (!c) return null
  return {
    text: (c.innerText || (c as HTMLInputElement).value || c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    ariaLabel: (c.getAttribute('aria-label') ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
    href: c instanceof HTMLAnchorElement ? c.href : '',
  }
}

/**
 * Performs one allow-listed action. Returns a refusal reason instead of acting when anything looks off: the
 * allow-list is checked here too, and the control under the pointer must still be an allowed one.
 */
export async function performAction(
  tabId: number,
  platform: HealPlatform,
  decision: HealDecision,
  element: HealElement | undefined,
): Promise<{ done: true } | { done: false; reason: string }> {
  switch (decision.action) {
    case 'click': {
      if (!element || !labelAllowed(element.text, element.ariaLabel) || !hrefAllowed(element.href, platform)) return { done: false, reason: 'not allow-listed' }
      let live: ReturnType<typeof controlAtPoint> | undefined
      try {
        const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: controlAtPoint, args: [element.x, element.y] })
        live = res?.result as ReturnType<typeof controlAtPoint>
      } catch (e) {
        return { done: false, reason: `cannot verify the control: ${msgOf(e)}` }
      }
      if (!live || !labelAllowed(live.text, live.ariaLabel) || !hrefAllowed(live.href, platform)) {
        return { done: false, reason: 'the control under the pointer is not an allowed one any more' }
      }
      await runTrustedInput(tabId, { action: 'clickAt', x: element.x, y: element.y })
      return { done: true }
    }
    case 'press_escape':
      await runTrustedInput(tabId, { action: 'pressEscape' })
      return { done: true }
    case 'reload_tab': {
      const tab = await chrome.tabs.get(tabId)
      // Same path as leaving a draft: it also answers a native "Leave site?" prompt
      await navigateLeavingDrafts(tabId, tab.url ?? tab.pendingUrl ?? '')
      return { done: true }
    }
    case 'scroll_top':
      await chrome.scripting.executeScript({ target: { tabId }, func: () => window.scrollTo({ top: 0 }) })
      return { done: true }
    case 'give_up':
      return { done: true }
  }
}

// ---------- the loop ----------

/** The error line carries what the healer did, so it shows on the social post */
const withNote = (err: string, note: string) => `${err} | ${note}`

export async function runWithHealing(
  job: BridgeJob,
  run: (job: BridgeJob) => Promise<unknown>,
  link: HealLink,
): Promise<unknown> {
  let firstError: unknown
  try {
    return await run(job)
  } catch (e) {
    firstError = e
  }
  const platform = healPlatform(job.type)
  const original = msgOf(firstError)
  if (!platform || !isHealableError(original)) throw firstError

  let currentError = original
  const tried: string[] = []
  for (let attempt = 1; attempt <= HEAL_LIMITS.perJob; attempt++) {
    const outcome = await healOnce(job, platform, currentError, attempt, link)
    if (outcome.kind === 'stop') throw new Error(withNote(currentError, outcome.note))
    tried.push(outcome.label)
    if (!isRetrySafe(job.type, currentError)) {
      throw new Error(withNote(currentError, `healed: ${outcome.label}, but not retried (the post may already be live)`))
    }
    try {
      const result = await run(job)
      const note = `${outcome.diagnosis}; ${outcome.label}`
      await finish(link, job, platform, currentError, outcome, 'retry_ok', true)
      return result && typeof result === 'object' ? { ...(result as object), healed: note } : result
    } catch (e) {
      currentError = msgOf(e)
      const last = attempt === HEAL_LIMITS.perJob || !isHealableError(currentError)
      await finish(link, job, platform, currentError, outcome, 'retry_failed', last)
      if (last) break
    }
  }
  throw new Error(withNote(currentError, `needs you: the automatic fixes did not work (tried ${tried.join(', ')})`))
}

type Outcome = { kind: 'acted'; label: string; diagnosis: string; decision: HealDecision; tabId: number; url: string; screenshot?: string } | { kind: 'stop'; note: string }

async function healOnce(job: BridgeJob, platform: HealPlatform, error: string, attempt: number, link: HealLink): Promise<Outcome> {
  const tabId = await findHealTab(platform)
  const report = (partial: Pick<HealReport, 'diagnosis' | 'action' | 'result'> & Partial<HealReport>) =>
    finishReport(link, { type: 'heal.report', id: `heal_${job.id}_${attempt}`, jobId: job.id, jobType: job.type, platform, error, needsHuman: false, final: false, url: '', ...partial })

  if (tabId === undefined) {
    return { kind: 'stop', note: 'healer: the platform tab is gone' }
  }

  const limit = checkHealLimit({ attempts: await recentAttempts() }, attempt - 1, Date.now())
  const [state, screenshot] = await Promise.all([collectState(tabId), captureScreenshot(tabId)])
  if (!limit.ok) {
    const reason = limit.reason === 'hour_limit' ? `${HEAL_LIMITS.perHour} heals already used this hour` : `${HEAL_LIMITS.perJob} heals already used on this job`
    await report({ diagnosis: 'Heal limit reached', action: 'none', result: 'limit_reached', needsHuman: true, humanReason: reason, final: true, screenshot, url: state?.url ?? '' })
    return { kind: 'stop', note: `needs you: ${reason}` }
  }
  await recordAttempt()

  const page: PageState = state ?? { url: '', title: '', elements: [], dialogs: [], toasts: [], pageText: '' }
  const req: HealRequest = {
    type: 'heal.request',
    id: `heal_${job.id}_${attempt}_${Date.now()}`,
    jobId: job.id,
    jobType: job.type,
    platform,
    error: error.slice(0, 2000),
    attempt,
    screenshot,
    ...page,
  }

  // Login, captcha, 2FA and locked accounts are never "fixed": a person is asked. Checked here too, so it works offline.
  const human = detectNeedsHuman(page) ?? (/^checkpoint_detected/.test(error) ? 'the platform asked for a security check' : null)
  let decision: HealDecision
  if (human) {
    decision = { diagnosis: `Needs a person: ${human}`, action: 'give_up', needsHuman: true, humanReason: human }
  } else {
    const answer = await link.requestHeal(req)
    const parsed = answer ? HealActionMessageSchema.safeParse(answer) : null
    decision = parsed?.success ? parsed.data : ruleDecision({ ...page, platform })
    // Second gate: whatever the worker said, only an allowed action goes through
    if (!validateAction(decision, { elements: page.elements, platform }).ok) decision = ruleDecision({ ...page, platform })
  }
  const checked = validateAction(decision, { elements: page.elements, platform })
  const element = checked.ok ? checked.element : undefined

  if (decision.needsHuman) {
    const why = decision.humanReason ?? decision.diagnosis
    await report({ diagnosis: decision.diagnosis, action: 'none', result: 'needs_human', needsHuman: true, humanReason: why, final: true, screenshot, url: page.url })
    return { kind: 'stop', note: `needs you: ${why}` }
  }
  if (!checked.ok || decision.action === 'give_up') {
    const why = checked.ok ? 'nothing it may fix is in the way' : `refused: ${checked.reason}`
    await report({ diagnosis: decision.diagnosis, action: 'give_up', result: checked.ok ? 'not_retried' : 'refused', final: true, screenshot, url: page.url })
    return { kind: 'stop', note: `healer saw ${decision.diagnosis.slice(0, 160)} (${why})` }
  }

  const label = describeAction(decision, element)
  const done = await performAction(tabId, platform, decision, element)
  if (!done.done) {
    await report({ diagnosis: decision.diagnosis, action: label, result: 'refused', final: true, screenshot, url: page.url })
    return { kind: 'stop', note: `healer refused to act: ${done.reason}` }
  }
  await sleep(3_000)
  return { kind: 'acted', label, diagnosis: decision.diagnosis, decision, tabId, url: page.url, screenshot }
}

/** Reports and logs the retry result; on the last failure a fresh screenshot goes with it */
async function finish(link: HealLink, job: BridgeJob, platform: HealPlatform, error: string, outcome: Extract<Outcome, { kind: 'acted' }>, result: HealResult, final: boolean) {
  const screenshot = result === 'retry_ok' ? undefined : final ? ((await captureScreenshot(outcome.tabId)) ?? outcome.screenshot) : undefined
  const needsHuman = result === 'retry_failed' && final
  await finishReport(link, {
    type: 'heal.report',
    id: `heal_${job.id}_${Date.now()}`,
    jobId: job.id,
    jobType: job.type,
    platform,
    error,
    diagnosis: outcome.diagnosis,
    action: outcome.label,
    result,
    needsHuman,
    humanReason: needsHuman ? 'the automatic fixes did not work' : undefined,
    final,
    url: outcome.url,
    screenshot,
  })
}

async function finishReport(link: HealLink, r: HealReport): Promise<void> {
  await appendHealLog({ at: Date.now(), jobType: r.jobType, platform: r.platform, diagnosis: r.diagnosis, action: r.action, result: r.result })
  link.sendReport(r)
}
