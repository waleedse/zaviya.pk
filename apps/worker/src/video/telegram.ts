import { readFile } from 'node:fs/promises'
import { logger } from '../logger.js'

/**
 * Sends only, with plain Bot API HTTP calls. The main worker long-polls Telegram with grammy: a second poller
 * (getUpdates or a grammy bot here) would get 409 Conflict and break it. The "Skip this video" button is answered
 * by the main worker, which sets Redis `video:skip:<key>`.
 */
export interface VideoTelegram {
  sendPreview(mp4: string, caption: string, key: string): Promise<void>
  notify(text: string): Promise<void>
}

export function createVideoTelegram(cfg: { token?: string; chatId?: string }, fetchImpl: typeof fetch = fetch): VideoTelegram {
  if (!cfg.token || !cfg.chatId) {
    return {
      sendPreview: async (mp4, caption, key) => void logger.info({ mp4, caption, key }, 'telegram preview skipped (no Telegram env)'),
      notify: async (text) => void logger.info({ text }, 'telegram notify skipped (no Telegram env)'),
    }
  }
  const api = (method: string) => `https://api.telegram.org/bot${cfg.token}/${method}`
  return {
    async sendPreview(mp4, caption, key) {
      const form = new FormData()
      form.set('chat_id', cfg.chatId!)
      form.set('caption', caption.slice(0, 1000))
      form.set('supports_streaming', 'true')
      form.set('width', '1080')
      form.set('height', '1920')
      form.set('reply_markup', JSON.stringify({ inline_keyboard: [[{ text: 'Skip this video', callback_data: `videoskip:${key}` }]] }))
      form.set('video', new Blob([new Uint8Array(await readFile(mp4))], { type: 'video/mp4' }), 'video.mp4')
      const res = await fetchImpl(api('sendVideo'), { method: 'POST', body: form, signal: AbortSignal.timeout(180_000) })
      if (!res.ok) throw new Error(`Telegram sendVideo HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
    },
    async notify(text) {
      const res = await fetchImpl(api('sendMessage'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: cfg.chatId, text: text.slice(0, 4000) }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) throw new Error(`Telegram sendMessage HTTP ${res.status}`)
    },
  }
}
