import { describe, expect, it } from 'vitest'
import { confirmRetract, executeAction, gatherStatus } from './execute.js'
import { makeExec, NOW } from './harness.js'

const ctx = { sender: 'waleed@zaviya.pk', subject: 'cmd', text: 'do it' }
const A = (type: string, args: object = {}) => ({ type, args, confidence: 0.95 }) as never

describe('executors', () => {
  it('status: published, queues, social per platform with failures, videos', async () => {
    const { exec } = makeExec()
    const text = (await executeAction(A('status'), ctx, exec)).join('\n')
    expect(text).toContain('published today: 12 of 60')
    expect(text).toContain('write: w=1')
    expect(text).toContain('x: 1 posted, 1 failed')
    expect(text).toContain('rate limit hit')
    expect(text).toContain('instagram: 1 posted, 0 failed')
    expect(text).toMatch(/morning 07:40 headlines30/)
  })

  it('status survives a section failing', async () => {
    const { exec, payload } = makeExec()
    payload.getSettings.mockRejectedValue(new Error('payload down'))
    const text = await gatherStatus(exec)
    expect(text).toContain('unavailable: payload down')
    expect(text).toContain('Social posts today')
  })

  it('pause / resume call the same controls as Telegram', async () => {
    const { exec, controls } = makeExec()
    await executeAction(A('pause'), ctx, exec)
    await executeAction(A('resume'), ctx, exec)
    expect(controls.pause).toHaveBeenCalledOnce()
    expect(controls.resume).toHaveBeenCalledOnce()
  })

  it('video_now queues a run with now:true for a known slot only', async () => {
    const { exec, videoQueue } = makeExec()
    const ok = await executeAction(A('video_now', { slot: 'morning' }), ctx, exec)
    expect(ok.join()).toContain('Queued video 2026-10-17-morning')
    expect(videoQueue.add).toHaveBeenCalledWith('run', { slot: 'morning', now: true }, expect.objectContaining({ jobId: expect.stringContaining('2026-10-17-morning') }))
    const bad = await executeAction(A('video_now', { slot: 'midnight' }), ctx, exec)
    expect(bad.join()).toContain('unknown video slot')
    expect(videoQueue.add).toHaveBeenCalledOnce()
  })

  it('video_now refuses a slot that does not run today, and one already done', async () => {
    const { exec, videoQueue, kv } = makeExec({ now: () => Date.UTC(2026, 9, 18, 5, 0) }) // Sunday: money/ai do not run
    expect((await executeAction(A('video_now', { slot: 'money' }), ctx, exec)).join()).toContain('does not run today')
    await kv.set('video:done:2026-10-18-morning', 'posted', 60)
    expect((await executeAction(A('video_now', { slot: 'morning' }), ctx, exec)).join()).toContain('already posted')
    expect(videoQueue.add).not.toHaveBeenCalled()
  })

  it('video_skip sets the 6 h skip key', async () => {
    const { exec, kv } = makeExec()
    await executeAction(A('video_skip', { slot: 'evening' }), ctx, exec)
    expect(await kv.get('video:skip:2026-10-17-evening')).toBe('1')
    const entry = (kv as unknown as { data: Map<string, { exp: number }> }).data.get('video:skip:2026-10-17-evening')!
    expect(entry.exp - NOW).toBe(6 * 3600 * 1000)
  })

  it('set_cap calls the pipeline API and reports failure honestly', async () => {
    const { exec, payload } = makeExec()
    expect((await executeAction(A('set_cap', { platform: 'instagram', perDay: 6 }), ctx, exec)).join()).toContain('now 6')
    expect(payload.setDailyCap).toHaveBeenCalledWith('instagram', 6)
    payload.setDailyCap.mockRejectedValue(new Error('404'))
    expect((await executeAction(A('set_cap', { platform: 'x', perDay: 3 }), ctx, exec)).join()).toContain('Nothing was changed')
  })

  it('handoff creates a Linear issue quoting Waleed; pm-approved only for seo/editor content', async () => {
    const { exec, linear } = makeExec()
    await executeAction(A('handoff', { agent: 'seo', title: 'Audit Karachi pages', details: 'd', contentOrSeo: true }), ctx, exec)
    await executeAction(A('handoff', { agent: 'engineer', title: 'Fix share button', details: 'd', contentOrSeo: true }), ctx, exec)
    await executeAction(A('handoff', { agent: 'editor', title: 'Rework homepage', details: 'd', contentOrSeo: false }), ctx, exec)
    expect(linear.createIssue.mock.calls.map((c) => c[0].pmApproved)).toEqual([true, false, false])
    expect(linear.createIssue.mock.calls[0]![0].description).toContain('> do it')
  })

  it('handoff without LINEAR_API_KEY or on error says it failed and keeps the text', async () => {
    const none = makeExec({ linear: null })
    const r1 = (await executeAction(A('handoff', { agent: 'product', title: 'Idea X', details: 'details here' }), ctx, none.exec)).join('\n')
    expect(r1).toContain('FAILED')
    expect(r1).toContain('Idea X')
    const err = makeExec()
    err.linear.createIssue.mockRejectedValue(new Error('Linear API 401'))
    expect((await executeAction(A('handoff', { agent: 'social', title: 'Post more', details: '' }), ctx, err.exec)).join('\n')).toMatch(/FAILED: Linear API 401/)
  })

  it('answer uses the model when it works and falls back to the numbers', async () => {
    const withModel = makeExec({ answerer: async () => '1 post on X.' })
    expect(await executeAction(A('answer', { question: 'x posts?' }), ctx, withModel.exec)).toEqual(['1 post on X.'])
    const noModel = makeExec({ answerer: async () => null })
    expect((await executeAction(A('answer', { question: 'x posts?' }), ctx, noModel.exec)).join('\n')).toContain('x: 1 posted')
  })

  it('dry run: read-only runs, mutations only describe', async () => {
    const { exec, controls, videoQueue, payload, linear } = makeExec({ dry: true })
    for (const a of [A('pause'), A('resume'), A('video_now', { slot: 'morning' }), A('video_skip', { slot: 'evening' }), A('set_cap', { platform: 'x', perDay: 1 }), A('retract', { url: 'https://zaviya.pk/en/budget' }), A('handoff', { agent: 'seo', title: 'abc' })]) {
      expect((await executeAction(a, ctx, exec)).join()).toContain('[dry run]')
    }
    expect(controls.pause).not.toHaveBeenCalled()
    expect(videoQueue.add).not.toHaveBeenCalled()
    expect(payload.setDailyCap).not.toHaveBeenCalled()
    expect(payload.retract).not.toHaveBeenCalled()
    expect(linear.createIssue).not.toHaveBeenCalled()
  })
})

describe('retract confirm flow', () => {
  const start = async (exec: ReturnType<typeof makeExec>['exec']) => {
    const out = (await executeAction(A('retract', { url: 'https://zaviya.pk/en/budget-passed', reason: 'wrong figures' }), ctx, exec)).join('\n')
    const code = /CONFIRM ([A-Z0-9]{6})/.exec(out)?.[1]
    return { out, code }
  }

  it('step one only issues a code: nothing is retracted', async () => {
    const { exec, payload } = makeExec()
    const { out, code } = await start(exec)
    expect(code).toMatch(/^[A-Z2-9]{6}$/)
    expect(out).toContain('NOT done yet')
    expect(payload.retract).not.toHaveBeenCalled()
  })

  it('CONFIRM <code> runs it exactly once', async () => {
    const { exec, payload } = makeExec()
    const { code } = await start(exec)
    const done = await confirmRetract(code!, ctx, exec)
    expect(done.join()).toContain('Retracted "Budget passed"')
    expect(payload.retract).toHaveBeenCalledWith('42', 'Email command: wrong figures')
    expect((await confirmRetract(code!, ctx, exec)).join()).toContain('unknown, already used')
    expect(payload.retract).toHaveBeenCalledOnce()
  })

  it('a code expires after 2 hours', async () => {
    let t = NOW
    const { exec } = makeExec({ now: () => t })
    // memoryKv in makeExec is bound to NOW; build one that follows t
    const { memoryKv } = await import('./kv.js')
    exec.kv = memoryKv(() => t)
    const { code } = await start(exec)
    t += 2 * 3600 * 1000 + 1000
    expect((await confirmRetract(code!, ctx, exec)).join()).toContain('older than 2 hours')
  })

  it('a code issued to someone else is refused, and a failed retract keeps the code', async () => {
    const { exec, payload } = makeExec()
    const { code } = await start(exec)
    expect((await confirmRetract(code!, { ...ctx, sender: 'seo@zaviya.pk' }, exec)).join()).toContain('another sender')
    payload.retract.mockRejectedValueOnce(new Error('boom'))
    expect((await confirmRetract(code!, ctx, exec)).join()).toContain('Retract failed')
    expect((await confirmRetract(code!, ctx, exec)).join()).toContain('Retracted')
  })

  it('an unknown or ambiguous article is never guessed', async () => {
    const { exec, payload } = makeExec()
    payload.request.mockImplementation(async () => ({ docs: [] }))
    expect((await executeAction(A('retract', { url: 'https://zaviya.pk/en/nothing' }), ctx, exec)).join()).toContain('could not find exactly one')
    payload.request.mockImplementation(async () => ({ docs: [{ id: 1 }, { id: 2 }] }))
    expect((await executeAction(A('retract', { url: 'https://zaviya.pk/en/dup' }), ctx, exec)).join()).toContain('could not find exactly one')
  })
})
