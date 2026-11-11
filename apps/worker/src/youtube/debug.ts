import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { JobDebug } from '@zaviya/shared'
import { logger } from '../logger.js'

/**
 * A failed Studio upload leaves evidence: the page summary goes to the log, the screenshot is saved as a JPEG whose path is
 * logged, and (when Telegram is set) the picture is sent to the admin chat so a changed Studio page can be fixed from the phone.
 */
export function createDebugHandler(opts: { dir: string; telegramToken?: string; chatId?: string }): (d: JobDebug) => void {
  return (d) => {
    let saved: string | undefined
    if (d.jpegBase64) {
      try {
        mkdirSync(opts.dir, { recursive: true })
        saved = path.join(opts.dir, `${d.id.replace(/[^A-Za-z0-9_-]/g, '_')}.jpg`)
        writeFileSync(saved, Buffer.from(d.jpegBase64, 'base64'))
      } catch (e) {
        logger.warn({ err: String(e) }, 'could not save the failure screenshot')
      }
    }
    logger.warn({ jobId: d.id, screenshot: saved, note: d.note.slice(0, 1500) }, 'YouTube upload failure evidence')
    if (d.jpegBase64 && opts.telegramToken && opts.chatId) {
      const form = new FormData()
      form.set('chat_id', opts.chatId)
      form.set('caption', `YouTube upload failed (${d.id}): ${d.note.slice(0, 700)}`)
      form.set('photo', new Blob([Buffer.from(d.jpegBase64, 'base64')], { type: 'image/jpeg' }), 'studio.jpg')
      void fetch(`https://api.telegram.org/bot${opts.telegramToken}/sendPhoto`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) }).catch((e: unknown) =>
        logger.warn({ err: String(e) }, 'could not send the failure screenshot to Telegram'),
      )
    }
  }
}
