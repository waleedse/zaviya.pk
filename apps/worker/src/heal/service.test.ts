import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  BridgeMessageSchema,
  HEAL_LIMITS,
  HealActionMessageSchema,
  HealDecisionSchema,
  checkHealLimit,
  detectNeedsHuman,
  hrefAllowed,
  isHealableError,
  isRetrySafe,
  labelAllowed,
  ruleDecision,
  validateAction,
  type HealElement,
  type HealRequest,
  type HealPlatform,
} from '@zaviya/shared'
import { memoryKv } from '../mail/kv.js'
import { buildHumanEmail, createHealService } from './service.js'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const fixture = (name: string) => ({
  state: JSON.parse(readFileSync(join(dir, `${name}.state.json`), 'utf8')) as Omit<HealRequest, 'type' | 'id' | 'jobId' | 'jobType' | 'platform' | 'error' | 'attempt'>,
  screenshot: readFileSync(join(dir, `${name}.jpg`)).toString('base64'),
})
const request = (name: string, over: Partial<HealRequest> = {}): HealRequest => {
  const f = fixture(name)
  return { type: 'heal.request', id: `h_${name}`, jobId: `job_${name}`, jobType: 'x.post', platform: 'x', error: 'composer_not_found', attempt: 1, ...f.state, screenshot: f.screenshot, ...over }
}
const el = (i: number, text: string, over: Partial<HealElement> = {}): HealElement => ({ i, tag: 'button', text, ariaLabel: '', href: '', x: 10, y: 10, inDialog: true, visible: true, ...over })
const llm = (answer: unknown | Error) => ({
  chat: vi.fn(async () => {
    if (answer instanceof Error) throw answer
    return { content: typeof answer === 'string' ? answer : JSON.stringify(answer), toolCalls: [], model: 'm', provider: 'gemini' }
  }),
})
function service(router: ReturnType<typeof llm>, extra: { now?: () => number } = {}) {
  const sent: { to: string; subject: string; body: string; attachments?: { filename: string; base64: string }[] }[] = []
  const svc = createHealService({ router: router as never, mailer: { send: vi.fn(async (m) => (sent.push(m as never), '<id>')) }, kv: memoryKv(extra.now), to: 'waleed@zaviya.pk', log: () => {}, ...extra })
  return { svc, sent }
}

describe('allow-list', () => {
  it.each(['Close', 'cancel', 'Not now', 'Skip for now', 'Got it', 'OK', 'Dismiss', 'Discard', 'Leave', 'Try again', 'Retry', 'Reload', 'Refresh', 'Continue', 'Maybe later', 'No thanks', 'X', '×', 'Decline optional cookies', 'Not now.'])(
    'lets "%s" through',
    (t) => expect(labelAllowed(t)).toBe(true),
  )
  it.each(['Post', 'Post all', 'Send', 'Delete', 'Delete post', 'Log out', 'Subscribe', 'Buy now', 'Premium', 'X Premium', 'Verify', 'Follow', 'Block', 'Report', 'Accept all cookies', 'Close account', 'Cancel subscription', 'Not now, log in', 'Turn on', 'Allow', 'Sign in', ''])(
    'refuses "%s"',
    (t) => expect(labelAllowed(t)).toBe(false),
  )
  it('checks the aria-label too: an icon button named Post is refused, an icon button named Close is fine', () => {
    expect(labelAllowed('', 'Close')).toBe(true)
    expect(labelAllowed('', 'Post')).toBe(false)
    expect(labelAllowed('Close', 'Post')).toBe(false)
  })
  it('keeps links on the platform and off account paths', () => {
    expect(hrefAllowed('', 'x')).toBe(true)
    expect(hrefAllowed('https://x.com/home', 'x')).toBe(true)
    expect(hrefAllowed('https://evil.example.com/close', 'x')).toBe(false)
    expect(hrefAllowed('https://x.com.evil.com/home', 'x')).toBe(false)
    expect(hrefAllowed('https://x.com/logout', 'x')).toBe(false)
    expect(hrefAllowed('https://x.com/i/premium_sign_up', 'x')).toBe(false)
    expect(hrefAllowed('javascript:alert(1)', 'x')).toBe(false)
    expect(hrefAllowed('https://www.instagram.com/accounts/logout/', 'instagram')).toBe(false)
    expect(hrefAllowed('https://x.com/home', 'instagram')).toBe(false)
  })
  it('the code refuses when the model asks to click Post or Log out', () => {
    const req = { platform: 'x' as HealPlatform, elements: [el(0, 'Post'), el(1, 'Log out'), el(2, 'Not now'), el(3, 'Close', { href: 'https://evil.com/x' })] }
    const ask = (i: number) => validateAction({ diagnosis: 'd', action: 'click', elementIndex: i, needsHuman: false }, req)
    expect(ask(0)).toMatchObject({ ok: false })
    expect(ask(1)).toMatchObject({ ok: false })
    expect(ask(3)).toMatchObject({ ok: false })
    expect(ask(9)).toMatchObject({ ok: false })
    expect(ask(2)).toMatchObject({ ok: true })
    expect(validateAction({ diagnosis: 'd', action: 'click', needsHuman: false }, req)).toMatchObject({ ok: false })
    expect(validateAction({ diagnosis: 'd', action: 'click', elementIndex: 2, needsHuman: false }, { ...req, elements: [el(2, 'Not now', { visible: false })] })).toMatchObject({ ok: false })
  })
  it('has no way to type or run anything: unknown actions fail the schema', () => {
    for (const action of ['type_text', 'eval', 'navigate', 'click_all']) {
      expect(HealDecisionSchema.safeParse({ diagnosis: 'd', action, needsHuman: false }).success).toBe(false)
      expect(validateAction({ diagnosis: 'd', action, needsHuman: false }, { platform: 'x', elements: [] })).toMatchObject({ ok: false })
    }
  })
})

describe('schemas and messages', () => {
  it('validates the model answer', () => {
    expect(HealDecisionSchema.parse({ diagnosis: 'a dialog', action: 'click', elementIndex: 1 }).needsHuman).toBe(false)
    expect(HealDecisionSchema.safeParse({ action: 'click' }).success).toBe(false)
    expect(HealDecisionSchema.safeParse({ diagnosis: 'd', action: 'click', elementIndex: -1 }).success).toBe(false)
  })
  it('the bridge messages parse', () => {
    expect(BridgeMessageSchema.safeParse(request('dialog')).success).toBe(true)
    expect(BridgeMessageSchema.safeParse({ type: 'heal.report', id: 'r', jobId: 'j', jobType: 'x.post', platform: 'x', error: 'e', diagnosis: 'd', action: 'click "Not now"', result: 'retry_ok' }).success).toBe(true)
    expect(HealActionMessageSchema.safeParse({ type: 'heal.action', id: 'r', diagnosis: 'd', action: 'press_escape', needsHuman: false }).success).toBe(true)
    expect(BridgeMessageSchema.safeParse({ ...request('dialog'), platform: 'facebook' }).success).toBe(false)
  })
  it('knows which errors are worth looking at', () => {
    for (const e of ['content_script_no_reply', 'post_not_sent: Post button stayed disabled', 'composer_not_found', 'gemini_editor_not_found', 'bridge job timeout', 'weird']) expect(isHealableError(e)).toBe(true)
    for (const e of ['platform_disabled', 'unknown_job', 'gemini_user_active', 'gemini_limit_reached']) expect(isHealableError(e)).toBe(false)
  })
  it('does not repeat a post whose outcome is unknown', () => {
    expect(isRetrySafe('x.post', 'content_script_no_reply')).toBe(false)
    expect(isRetrySafe('x.post', 'composer_not_found')).toBe(true)
    expect(isRetrySafe('x.readList', 'content_script_no_reply')).toBe(true)
  })
})

describe('rate limits', () => {
  it('allows 2 per job and 6 per hour', () => {
    const t = 10_000_000
    expect(checkHealLimit({ attempts: [] }, 0, t).ok).toBe(true)
    expect(checkHealLimit({ attempts: [] }, HEAL_LIMITS.perJob, t)).toEqual({ ok: false, reason: 'job_limit' })
    const six = Array.from({ length: 6 }, (_, i) => t - i * 60_000)
    expect(checkHealLimit({ attempts: six }, 0, t)).toEqual({ ok: false, reason: 'hour_limit' })
    expect(checkHealLimit({ attempts: six }, 0, t + 61 * 60_000).ok).toBe(true)
  })
  it('the worker enforces them too', async () => {
    const router = llm({ diagnosis: 'dialog', action: 'click', elementIndex: 1, needsHuman: false })
    const { svc } = service(router)
    const actions: string[] = []
    for (let n = 0; n < 8; n++) actions.push((await svc.decide(request('dialog', { jobId: `job_${n}` }))).action)
    expect(actions.slice(0, 6).every((a) => a === 'click')).toBe(true)
    expect(actions.slice(6)).toEqual(['give_up', 'give_up'])
    expect(router.chat).toHaveBeenCalledTimes(6)
    const { svc: s2 } = service(llm({ diagnosis: 'd', action: 'click', elementIndex: 1, needsHuman: false }))
    const third = [await s2.decide(request('dialog')), await s2.decide(request('dialog')), await s2.decide(request('dialog'))]
    expect(third.map((a) => a.action)).toEqual(['click', 'click', 'give_up'])
  })
})

describe('rule fallback', () => {
  const rule = (name: string, platform: HealPlatform = 'x') => ruleDecision({ ...fixture(name).state, platform })
  it('closes a notification dialog with Not now, never Turn on or Post', () => {
    const d = rule('dialog')
    expect(d).toMatchObject({ action: 'click', elementIndex: 1 })
  })
  it('declines a cookie banner instead of accepting', () => {
    expect(rule('cookie')).toMatchObject({ action: 'click', elementIndex: 1 })
  })
  it('clicks Try again on a "Something went wrong" page', () => {
    expect(rule('error')).toMatchObject({ action: 'click', elementIndex: 2 })
    expect(ruleDecision({ platform: 'x', url: 'https://x.com/home', dialogs: [], toasts: [], pageText: 'Something went wrong. Try again later', elements: [] })).toMatchObject({ action: 'reload_tab' })
  })
  it('asks a person for login, captcha, locked and 2FA', () => {
    expect(rule('login')).toMatchObject({ action: 'give_up', needsHuman: true })
    expect(detectNeedsHuman({ url: 'https://x.com/home', dialogs: ['Please complete the CAPTCHA'], toasts: [], pageText: '' })).toMatch(/captcha/)
    expect(detectNeedsHuman({ url: 'https://x.com/account/access', dialogs: [], toasts: [], pageText: 'Your account has been locked' })).toMatch(/locked/)
    expect(detectNeedsHuman({ url: 'https://www.instagram.com/accounts/login/', dialogs: [], toasts: [], pageText: '' })).toBeTruthy()
    expect(detectNeedsHuman({ url: 'https://x.com/home', dialogs: ['Enter your verification code'], toasts: [], pageText: '' })).toBeTruthy()
    expect(detectNeedsHuman({ url: 'https://x.com/home', dialogs: ['Turn on notifications?'], toasts: [], pageText: 'Home' })).toBeNull()
  })
  it('presses Escape for a dialog without a safe button, and gives up when nothing is wrong', () => {
    expect(ruleDecision({ platform: 'x', url: 'https://x.com/home', dialogs: ['Pick a plan'], toasts: [], pageText: '', elements: [el(0, 'Subscribe')] })).toMatchObject({ action: 'press_escape' })
    expect(ruleDecision({ platform: 'x', url: 'https://x.com/home', dialogs: [], toasts: [], pageText: 'Home', elements: [el(0, 'Post', { inDialog: false })] })).toMatchObject({ action: 'give_up', needsHuman: false })
  })
  it('prefers Leave and Discard on an unsent-draft prompt', () => {
    const d = ruleDecision({ platform: 'x', url: 'https://x.com/home', dialogs: ['Discard post? This can\'t be undone'], toasts: [], pageText: '', elements: [el(0, 'Cancel'), el(1, 'Discard')] })
    expect(d).toMatchObject({ action: 'click', elementIndex: 1 })
  })
  it('every rule answer passes the allow-list', () => {
    for (const n of ['dialog', 'cookie', 'error', 'login']) {
      const s = fixture(n).state
      expect(validateAction(ruleDecision({ ...s, platform: 'x' }), { ...s, platform: 'x' }).ok).toBe(true)
    }
  })
})

describe('worker heal handler against the saved screenshots', () => {
  it('passes the screenshot to the vision model and returns its allowed choice', async () => {
    const router = llm({ diagnosis: 'A notifications dialog covers the page; Not now closes it', action: 'click', elementIndex: 1, needsHuman: false })
    const { svc } = service(router)
    const r = await svc.decide(request('dialog'))
    expect(r).toMatchObject({ type: 'heal.action', id: 'h_dialog', source: 'llm', action: 'click', elementIndex: 1 })
    const [task, opts] = router.chat.mock.calls[0] as unknown as [string, { messages: { role: string; content: string; images?: { mimeType: string; base64: string }[] }[] }]
    expect(task).toBe('vision')
    const user = opts.messages.find((m) => m.role === 'user')!
    expect(user.images?.[0]).toMatchObject({ mimeType: 'image/jpeg' })
    expect(user.images![0]!.base64.length).toBeGreaterThan(5_000)
    expect(user.content).toContain('"Not now"')
  })
  it('refuses a model that picks Post and falls back to the rules', async () => {
    const { svc } = service(llm({ diagnosis: 'post it', action: 'click', elementIndex: 2, needsHuman: false }))
    const r = await svc.decide(request('dialog'))
    expect(r.source).toBe('rules')
    expect(r).toMatchObject({ action: 'click', elementIndex: 1 })
    expect(r.diagnosis).toMatch(/refused/)
  })
  it('falls back to the rules on bad JSON and on quota exhaustion', async () => {
    for (const router of [llm('not json'), llm(new Error('Gemini quota exhausted for all models')), llm({ diagnosis: 'x', action: 'type_text', needsHuman: false })]) {
      const { svc } = service(router)
      const r = await svc.decide(request('cookie'))
      expect(r).toMatchObject({ source: 'rules', action: 'click', elementIndex: 1 })
    }
  })
  it('does not even ask the model for a login wall', async () => {
    const router = llm({ diagnosis: 'x', action: 'click', elementIndex: 0, needsHuman: false })
    const { svc } = service(router)
    const r = await svc.decide(request('login'))
    expect(r).toMatchObject({ action: 'give_up', needsHuman: true })
    expect(router.chat).not.toHaveBeenCalled()
  })
  it('a model that says needsHuman never gets a click through', async () => {
    const { svc } = service(llm({ diagnosis: 'captcha', action: 'click', elementIndex: 1, needsHuman: true, humanReason: 'captcha' }))
    expect(await svc.decide(request('dialog'))).toMatchObject({ action: 'give_up', needsHuman: true })
  })
})

describe('emails', () => {
  const report = { type: 'heal.report' as const, id: 'r', jobId: 'j', jobType: 'x.post', platform: 'x' as const, error: 'composer_not_found', diagnosis: 'Login page', action: 'none', result: 'needs_human' as const, needsHuman: true, humanReason: 'the account is logged out', final: true, url: 'https://x.com/i/flow/login', screenshot: Buffer.from('jpegbytes').toString('base64') }
  it('says exactly what to do and attaches the screenshot', () => {
    const m = buildHumanEmail(report, 'waleed@zaviya.pk')
    expect(m.subject).toMatch(/needs you: X/)
    expect(m.body).toContain('Open x.com in Chrome')
    expect(m.body).toContain('log in')
    expect(m.attachments?.[0]).toMatchObject({ contentType: 'image/jpeg', filename: 'x-screen.jpg' })
  })
  it('sends at most one email per platform per 2 hours', async () => {
    let t = 1_000_000
    const { svc, sent } = service(llm(new Error('x')), { now: () => t })
    await svc.report(report)
    await svc.report(report)
    await svc.report({ ...report, platform: 'instagram' })
    expect(sent.map((m) => m.subject)).toEqual([expect.stringContaining('X is stuck'), expect.stringContaining('Instagram is stuck')])
    t += 2 * 60 * 60_000 + 1
    await svc.report(report)
    expect(sent).toHaveLength(3)
  })
  it('stays quiet for a heal that worked', async () => {
    const { svc, sent } = service(llm(new Error('x')))
    await svc.report({ ...report, needsHuman: false, final: true, result: 'retry_ok' })
    await svc.report({ ...report, needsHuman: false, final: false, result: 'retry_failed' })
    expect(sent).toHaveLength(0)
    expect(svc.recent()).toHaveLength(2)
  })
})

describe('allow-list: third-party sign-in', () => {
  it('never clicks "Continue with Google" or "Sign in with Apple", but still clicks plain Continue', async () => {
    const { labelAllowed } = await import('@zaviya/shared')
    expect(labelAllowed('Continue with Google')).toBe(false)
    expect(labelAllowed('Continue with Apple')).toBe(false)
    expect(labelAllowed('Continue')).toBe(true)
    expect(labelAllowed('Not now')).toBe(true)
  })
})
