import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BridgeJob, HealActionMessage, HealReport, HealRequest } from '@zaviya/shared'

/**
 * The extension's heal loop (./heal.ts) run against a fake `chrome`:
 * what it asks, what it clicks, when it retries, what it writes into the error line.
 */
const store: Record<string, unknown> = {}
const clicks: { x: number; y: number }[] = []
const keys: string[] = []
let page: unknown
const commands: string[] = []

function fakeChrome(live: { text: string; ariaLabel?: string; href?: string } | null) {
  const area = {
    get: async (k: string) => ({ [k]: store[k] }),
    set: async (o: Record<string, unknown>) => void Object.assign(store, o),
  }
  vi.stubGlobal('chrome', {
    storage: { local: area, session: { get: async () => ({ 'ownTab:x': 7 }), set: async () => undefined } },
    tabs: { get: async (id: number) => ({ id, url: 'https://x.com/home' }), query: async () => [], update: async () => ({}) },
    scripting: {
      // first call collects the page, a call with args is the live check before a click
      executeScript: vi.fn(async (o: { args?: number[] }) => [{ result: o.args ? (live ? { ariaLabel: '', href: '', ...live } : null) : page }]),
    },
    debugger: {
      attach: async () => undefined,
      detach: async () => undefined,
      onEvent: { addListener: () => undefined, removeListener: () => undefined },
      onDetach: { addListener: () => undefined },
      sendCommand: async (_t: unknown, method: string, p?: Record<string, unknown>) => {
        commands.push(method)
        if (method === 'Page.getLayoutMetrics') return { cssVisualViewport: { clientWidth: 1600, clientHeight: 900 } }
        if (method === 'Page.captureScreenshot') return { data: 'SkZJRg==' }
        if (method === 'Input.dispatchMouseEvent' && p?.type === 'mousePressed') clicks.push({ x: p.x as number, y: p.y as number })
        if (method === 'Input.dispatchKeyEvent' && p?.type === 'rawKeyDown') keys.push(p.key as string)
        return {}
      },
    },
  })
}

const dialogPage = {
  url: 'https://x.com/home',
  title: 'Home',
  elements: [
    { i: 0, tag: 'button', text: 'Turn on', ariaLabel: '', href: '', x: 640, y: 435, inDialog: true, visible: true },
    { i: 1, tag: 'button', text: 'Not now', ariaLabel: '', href: '', x: 640, y: 484, inDialog: true, visible: true },
    { i: 2, tag: 'button', text: 'Post', ariaLabel: '', href: '', x: 1219, y: 757, inDialog: false, visible: true },
  ],
  dialogs: ['Turn on notifications? Turn on Not now'],
  toasts: [],
  pageText: 'Home',
}
const job = (type = 'x.readList'): BridgeJob => ({ id: 'job_1', type, payload: { listUrl: 'https://x.com/i/lists/1' } }) as BridgeJob
const answer = (over: Partial<HealActionMessage>): HealActionMessage => ({ type: 'heal.action', id: '', diagnosis: 'a dialog', action: 'click', elementIndex: 1, needsHuman: false, source: 'llm', ...over })

function link(reply: (req: HealRequest) => HealActionMessage | null) {
  const reports: HealReport[] = []
  const requests: HealRequest[] = []
  return {
    reports,
    requests,
    l: {
      requestHeal: vi.fn(async (r: HealRequest) => (requests.push(r), reply(r))),
      sendReport: (r: HealReport) => void reports.push(r),
    },
  }
}

async function load() {
  vi.resetModules()
  return import('./heal')
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  clicks.length = 0
  keys.length = 0
  commands.length = 0
  page = dialogPage
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.stubGlobal('setTimeout', ((fn: () => void) => globalThis.queueMicrotask(fn)) as never)
  fakeChrome({ text: 'Not now' })
})

describe('extension heal loop', () => {
  it('sees the page, clicks the allowed button with real input, retries once and marks the result healed', async () => {
    const { runWithHealing, readHealLog } = await load()
    const { l, requests, reports } = link(() => answer({ elementIndex: 1 }))
    const run = vi.fn().mockRejectedValueOnce(new Error('composer_not_found')).mockResolvedValueOnce({ posts: [] })
    const res = await runWithHealing(job(), run, l)
    expect(run).toHaveBeenCalledTimes(2)
    expect(res).toMatchObject({ posts: [], healed: expect.stringContaining('click "Not now"') })
    expect(clicks).toEqual([{ x: 640, y: 484 }])
    expect(requests[0]).toMatchObject({ jobType: 'x.readList', platform: 'x', error: 'composer_not_found', screenshot: 'SkZJRg==' })
    expect(commands).toContain('Page.captureScreenshot')
    expect(reports.at(-1)).toMatchObject({ result: 'retry_ok', action: 'click "Not now"' })
    expect(await readHealLog()).toHaveLength(1)
  })

  it('refuses a click on Post even when the worker asks for it, and never clicks', async () => {
    const { runWithHealing } = await load()
    const { l, reports } = link(() => answer({ elementIndex: 2 }))
    const run = vi.fn().mockRejectedValue(new Error('composer_not_found'))
    // the rules take over and pick Not now: Post is never clicked
    await runWithHealing(job(), run, l).catch(() => undefined)
    expect(clicks.every((c) => c.y !== 757)).toBe(true)
    expect(reports.length).toBeGreaterThan(0)
  })

  it('refuses when the control under the pointer is no longer an allowed one', async () => {
    fakeChrome({ text: 'Post' })
    const { runWithHealing } = await load()
    const { l, reports } = link(() => answer({ elementIndex: 1 }))
    const run = vi.fn().mockRejectedValue(new Error('composer_not_found'))
    await expect(runWithHealing(job(), run, l)).rejects.toThrow(/healer refused to act/)
    expect(clicks).toHaveLength(0)
    expect(run).toHaveBeenCalledTimes(1)
    expect(reports.at(-1)).toMatchObject({ result: 'refused' })
  })

  it('asks for a person on a login wall: no click, no retry, "needs you" in the error', async () => {
    page = { ...dialogPage, url: 'https://x.com/i/flow/login', dialogs: [], elements: [], pageText: 'Log in to X' }
    const { runWithHealing } = await load()
    const { l, reports, requests } = link(() => null)
    const run = vi.fn().mockRejectedValue(new Error('content_script_no_reply'))
    await expect(runWithHealing(job(), run, l)).rejects.toThrow(/content_script_no_reply \| needs you: /)
    expect(run).toHaveBeenCalledTimes(1)
    expect(requests).toHaveLength(0)
    expect(reports.at(-1)).toMatchObject({ result: 'needs_human', needsHuman: true, final: true, screenshot: 'SkZJRg==' })
  })

  it('uses the rules when the worker does not answer', async () => {
    const { runWithHealing } = await load()
    const { l } = link(() => null)
    const run = vi.fn().mockRejectedValueOnce(new Error('composer_not_found')).mockResolvedValueOnce({ ok: 1 })
    await runWithHealing(job(), run, l)
    expect(clicks).toEqual([{ x: 640, y: 484 }])
  })

  it('a worker answer outside the list is ignored (typing, navigating)', async () => {
    const { runWithHealing } = await load()
    const { l } = link(() => ({ type: 'heal.action', id: '', diagnosis: 'x', action: 'type_text', needsHuman: false, source: 'llm' }) as never)
    const run = vi.fn().mockRejectedValueOnce(new Error('composer_not_found')).mockResolvedValueOnce({ ok: 1 })
    await runWithHealing(job(), run, l)
    expect(keys).toEqual([])
    expect(clicks).toEqual([{ x: 640, y: 484 }])
  })

  it('presses Escape with trusted input', async () => {
    const { runWithHealing } = await load()
    const { l } = link(() => answer({ action: 'press_escape', elementIndex: undefined }))
    const run = vi.fn().mockRejectedValueOnce(new Error('composer_not_found')).mockResolvedValueOnce({ ok: 1 })
    await runWithHealing(job(), run, l)
    expect(keys).toEqual(['Escape'])
  })

  it('heals at most twice per job and then says it needs you', async () => {
    const { runWithHealing } = await load()
    const { l, reports } = link(() => answer({ elementIndex: 1 }))
    const run = vi.fn().mockRejectedValue(new Error('composer_not_found'))
    await expect(runWithHealing(job(), run, l)).rejects.toThrow(/composer_not_found \| needs you: the automatic fixes did not work/)
    expect(run).toHaveBeenCalledTimes(3) // the original run and one retry per heal
    expect(reports.filter((r) => r.final)).toHaveLength(1)
  })

  it('stops at 6 heals per hour across jobs', async () => {
    const { runWithHealing } = await load()
    const { l, reports } = link(() => answer({ elementIndex: 1 }))
    const fail = () => vi.fn().mockRejectedValue(new Error('composer_not_found'))
    for (let n = 0; n < 3; n++) await runWithHealing(job(), fail(), l).catch(() => undefined) // 2 heals each = 6
    const run = fail()
    await expect(runWithHealing(job(), run, l)).rejects.toThrow(/needs you: 6 heals already used this hour/)
    expect(run).toHaveBeenCalledTimes(1)
    expect(reports.at(-1)).toMatchObject({ result: 'limit_reached', needsHuman: true })
  })

  it('does not repeat a post whose outcome is unknown, and leaves trivial errors alone', async () => {
    const { runWithHealing } = await load()
    const { l, requests } = link(() => answer({ elementIndex: 1 }))
    const post = vi.fn().mockRejectedValue(new Error('content_script_no_reply'))
    await expect(runWithHealing(job('x.post'), post, l)).rejects.toThrow(/not retried/)
    expect(post).toHaveBeenCalledTimes(1)
    const off = vi.fn().mockRejectedValue(new Error('platform_disabled'))
    await expect(runWithHealing(job(), off, l)).rejects.toThrow(/^platform_disabled$/)
    const reader = vi.fn().mockRejectedValue(new Error('anything'))
    await expect(runWithHealing({ id: 'p', type: 'page.read', payload: { url: 'https://example.com' } } as BridgeJob, reader, l)).rejects.toThrow(/^anything$/)
    expect(requests).toHaveLength(1)
  })
})
