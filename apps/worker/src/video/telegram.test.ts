import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createVideoTelegram } from './telegram.js'

describe('video telegram (send only)', () => {
  it('does nothing without Telegram env', async () => {
    const f = vi.fn()
    const t = createVideoTelegram({}, f as unknown as typeof fetch)
    await t.notify('hi')
    await t.sendPreview('/nope.mp4', 'cap', 'k')
    expect(f).not.toHaveBeenCalled()
  })

  it('sends the video with a Skip button using only sendVideo and sendMessage', async () => {
    const f = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
    const t = createVideoTelegram({ token: 'T', chatId: '42' }, f as unknown as typeof fetch)
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'tg-')), 'v.mp4')
    writeFileSync(file, 'abc')
    await t.sendPreview(file, 'Posting at 08:00', '2026-10-17-morning')
    await t.notify('done')
    const calls = f.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0]![0]).toBe('https://api.telegram.org/botT/sendVideo')
    const form = calls[0]![1].body as FormData
    expect(form.get('chat_id')).toBe('42')
    expect(JSON.parse(String(form.get('reply_markup')))).toEqual({ inline_keyboard: [[{ text: 'Skip this video', callback_data: 'videoskip:2026-10-17-morning' }]] })
    expect(form.get('video')).toBeInstanceOf(Blob)
    expect(calls[1]![0]).toBe('https://api.telegram.org/botT/sendMessage')
    for (const [url] of calls) expect(url).not.toContain('getUpdates')
  })

  it('throws on an HTTP error', async () => {
    const t = createVideoTelegram({ token: 'T', chatId: '1' }, (async () => new Response('no', { status: 400 })) as unknown as typeof fetch)
    await expect(t.notify('x')).rejects.toThrow(/400/)
  })
})
