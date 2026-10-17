import { describe, expect, it, vi } from 'vitest'
import { plain, spoofedFromOutside, TEST_KEY_LOOKUP } from './fixtures.js'
import { makeExec } from './harness.js'
import { processMailbox, type ProcessorDeps } from './processor.js'
import { buildMessage } from './transport.js'

function setup(mails: Record<number, string>, llm: 'ok-status' | 'down' | { actions: unknown[] } = 'down') {
  const h = makeExec()
  const seen = new Set<number>()
  const box = {
    listUnseen: vi.fn(async () => Object.keys(mails).map(Number).filter((u) => !seen.has(u)).sort((a, b) => a - b)),
    fetchRaw: vi.fn(async (uid: number) => Buffer.from(mails[uid]!, 'latin1')),
    markSeen: vi.fn(async (uid: number) => void seen.add(uid)),
    close: vi.fn(),
  }
  const sent: { to: string; subject: string; body: string; inReplyTo?: string | null }[] = []
  const mailer = { send: vi.fn(async (m) => (sent.push(m), '<out@zaviya.pk>')) }
  const chat = vi.fn(async () => {
    if (llm === 'down') throw new Error('offline')
    const actions = llm === 'ok-status' ? [{ type: 'status', args: {}, confidence: 0.99 }] : llm.actions
    return { content: JSON.stringify({ actions, reply_summary: 'sum' }), toolCalls: [] }
  })
  const notify = vi.fn(async () => {})
  const deps: ProcessorDeps = { box, mailer, kv: h.kv, exec: h.exec, auth: { allowed: ['waleed@zaviya.pk'], lookup: TEST_KEY_LOOKUP }, router: { chat } as never, notifyAdmin: notify, log: () => {} }
  return { deps, box, sent, chat, notify, seen, h }
}

describe('processMailbox', () => {
  it('runs a command from Waleed, replies in-thread to him, then marks seen', async () => {
    const t = setup({ 7: plain('status', { id: '<m7@x>' }) }, 'ok-status')
    const sum = await processMailbox(t.deps)
    expect(sum).toMatchObject({ handled: 1, rejected: 0 })
    expect(t.sent).toHaveLength(1)
    expect(t.sent[0]).toMatchObject({ to: 'waleed@zaviya.pk', subject: 'Re: cmd', inReplyTo: '<m7@x>' })
    expect(t.sent[0]!.body).toContain('Understood: sum')
    expect(t.sent[0]!.body).toContain('published today: 12 of 60')
    expect(t.seen.has(7)).toBe(true)
  })

  it('rejects a spoofed sender silently: seen, no reply, no action, one Telegram notice per hour', async () => {
    const t = setup({ 1: spoofedFromOutside(), 2: spoofedFromOutside().replace('spoof@evil', 'spoof2@evil') }, 'ok-status')
    const sum = await processMailbox(t.deps)
    expect(sum.rejected).toBe(2)
    expect(t.sent).toHaveLength(0)
    expect(t.chat).not.toHaveBeenCalled()
    expect(t.seen.size).toBe(2)
    expect(t.notify).toHaveBeenCalledTimes(1)
  })

  it('is idempotent: a mail already done is only marked seen', async () => {
    const t = setup({ 3: plain('status', { id: '<dup@x>' }) }, 'ok-status')
    await processMailbox(t.deps)
    t.seen.clear() // server shows it unread again
    await processMailbox(t.deps)
    expect(t.sent).toHaveLength(1)
    expect(t.chat).toHaveBeenCalledOnce()
    expect(t.seen.has(3)).toBe(true)
  })

  it('a failed reply does not run the actions twice on the next pass', async () => {
    const t = setup({ 4: plain('pause', { id: '<p@x>' }) }, { actions: [{ type: 'pause', args: {}, confidence: 0.95 }] })
    t.deps.mailer.send = vi.fn().mockRejectedValueOnce(new Error('smtp down')).mockResolvedValue('<ok@zaviya.pk>')
    const first = await processMailbox(t.deps)
    expect(first.errors).toBe(1)
    expect(t.seen.has(4)).toBe(false)
    await processMailbox(t.deps)
    expect(t.h.controls.pause).toHaveBeenCalledOnce()
    expect(t.seen.has(4)).toBe(true)
  })

  it('handles at most 5 mails per run, oldest first', async () => {
    const mails = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((u) => [u, plain('status', { id: `<m${u}@x>` })]))
    const t = setup(mails, 'ok-status')
    const sum = await processMailbox(t.deps)
    expect(sum.handled).toBe(5)
    expect([...t.seen].sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('low confidence: risky action is not run, reply asks to confirm', async () => {
    const t = setup({ 5: plain('stop it maybe') }, { actions: [{ type: 'pause', args: {}, confidence: 0.4 }] })
    await processMailbox(t.deps)
    expect(t.h.controls.pause).not.toHaveBeenCalled()
    expect(t.sent[0]!.body).toContain('did NOT do them')
  })

  it('unknown: replies with examples', async () => {
    const t = setup({ 6: plain('hello there') }, { actions: [{ type: 'unknown', args: {}, confidence: 0.9 }] })
    await processMailbox(t.deps)
    expect(t.sent[0]!.body).toContain('video now morning')
  })

  it('model down: core command still works through the keyword parser', async () => {
    const t = setup({ 8: plain('video now morning') }, 'down')
    await processMailbox(t.deps)
    expect(t.h.videoQueue.add).toHaveBeenCalledOnce()
    expect(t.seen.has(8)).toBe(true)
  })

  it('model down and not a core command: leave unread, say so once', async () => {
    const t = setup({ 9: plain('please ask SEO to audit Karachi', { id: '<aud@x>' }) }, 'down')
    await processMailbox(t.deps)
    await processMailbox(t.deps)
    await processMailbox(t.deps)
    expect(t.seen.has(9)).toBe(false)
    expect(t.sent).toHaveLength(1)
    expect(t.sent[0]!.body).toContain('process it when the model is back')
    expect(t.h.linear.createIssue).not.toHaveBeenCalled()
  })

  it('retract end to end: first mail gets a code, the CONFIRM mail runs it (no model needed)', async () => {
    const t = setup({ 10: plain('retract https://zaviya.pk/en/budget-passed', { id: '<r1@x>' }) }, { actions: [{ type: 'retract', args: { url: 'https://zaviya.pk/en/budget-passed', reason: 'wrong' }, confidence: 0.95 }] })
    await processMailbox(t.deps)
    expect(t.h.payload.retract).not.toHaveBeenCalled()
    const code = /CONFIRM ([A-Z0-9]{6})/.exec(t.sent[0]!.body)![1]!
    ;(t.deps.box.fetchRaw as ReturnType<typeof vi.fn>).mockImplementation(async (uid: number) => Buffer.from(uid === 11 ? plain(`CONFIRM ${code}`, { id: '<r2@x>' }) : plain('x'), 'latin1'))
    ;(t.deps.box.listUnseen as ReturnType<typeof vi.fn>).mockResolvedValue([11])
    t.chat.mockClear()
    await processMailbox(t.deps)
    expect(t.h.payload.retract).toHaveBeenCalledWith('42', 'Email command: wrong')
    expect(t.chat).not.toHaveBeenCalled()
    expect(t.sent[1]!.body).toContain('Retracted "Budget passed"')
  })

  it('dry run: replies but never marks seen or records state', async () => {
    const t = setup({ 12: plain('pause', { id: '<d@x>' }) }, { actions: [{ type: 'pause', args: {}, confidence: 0.95 }] })
    t.deps.dry = true
    t.deps.exec.dry = true
    await processMailbox(t.deps)
    expect(t.sent[0]!.body).toContain('[dry run]')
    expect(t.h.controls.pause).not.toHaveBeenCalled()
    expect(t.seen.size).toBe(0)
    expect((t.h.kv as unknown as { data: Map<string, unknown> }).data.size).toBe(0)
  })
})

describe('buildMessage', () => {
  it('threads the reply, encodes Urdu, and cannot be header-injected', () => {
    const raw = buildMessage('ops@zaviya.pk', { to: 'a@b.pk\r\nBcc: evil@x.com', subject: 'Re: شام\r\nX: y', body: 'خیریت\n.dot', inReplyTo: '<m@x>', references: '<r@x>' }, '<id@zaviya.pk>')
    const head = raw.split('\r\n\r\n')[0]!
    expect(head).toContain('In-Reply-To: <m@x>')
    expect(head).toContain('References: <r@x> <m@x>')
    expect(head).toContain('Subject: =?UTF-8?B?')
    expect(head.split('\r\n').filter((l) => /^Bcc:|^X:/.test(l))).toHaveLength(0)
    expect(Buffer.from(raw.split('\r\n\r\n')[1]!.replace(/\r\n/g, ''), 'base64').toString()).toBe('خیریت\n.dot')
  })
})

describe('buildMessage with attachments', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 250]).toString('base64')
  const mail = { to: 'waleed@zaviya.pk', subject: 'Zaviya needs you: X', body: 'Log in again.\n.dot', attachments: [{ filename: 'x screen\r\n.jpg', contentType: 'image/jpeg', base64: jpeg }] }

  it('builds multipart/mixed with a text part and a JPEG part', () => {
    const raw = buildMessage('ops@zaviya.pk', mail, '<id@zaviya.pk>')
    const [head, ...rest] = raw.split('\r\n\r\n')
    const boundary = /boundary="([^"]+)"/.exec(head!)![1]!
    expect(head).toContain('Content-Type: multipart/mixed')
    const body = rest.join('\r\n\r\n')
    expect(body.startsWith(`--${boundary}\r\n`)).toBe(true)
    expect(body.trimEnd().endsWith(`--${boundary}--`)).toBe(true)
    const parts = body.split(`--${boundary}`).filter((p) => p.trim() && p.trim() !== '--')
    expect(parts).toHaveLength(2)
    expect(parts[0]).toContain('text/plain; charset=utf-8')
    const text = parts[0]!.split('\r\n\r\n')[1]!.replace(/\r\n/g, '')
    expect(Buffer.from(text, 'base64').toString()).toBe('Log in again.\n.dot')
    expect(parts[1]).toContain('Content-Type: image/jpeg; name="x screen .jpg"')
    expect(parts[1]).toContain('Content-Disposition: attachment; filename=')
    const data = parts[1]!.split('\r\n\r\n')[1]!.replace(/\r\n/g, '')
    expect(Buffer.from(data, 'base64').equals(Buffer.from(jpeg, 'base64'))).toBe(true)
  })

  it('keeps every line at most 998 characters and the file name header-safe', () => {
    const raw = buildMessage('ops@zaviya.pk', { ...mail, attachments: [{ ...mail.attachments[0]!, base64: Buffer.alloc(200_000, 7).toString('base64') }] }, '<id@zaviya.pk>')
    expect(Math.max(...raw.split('\r\n').map((l) => l.length))).toBeLessThanOrEqual(78)
    expect(raw.split('\r\n').filter((l) => /^(Bcc|X):/.test(l))).toHaveLength(0)
  })
})
