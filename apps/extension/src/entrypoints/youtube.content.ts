import { describePage, StudioError, uploadToStudio } from '../lib/youtube-dom'

/**
 * Receives the MP4 in chunks from the background page (the file is fetched there: the service worker has host permission
 * for our media URL, the Studio page would be bound by CORS), then drives the Studio upload dialog.
 */
let chunks: Uint8Array[] = []
let expected = 0

const b64ToBytes = (b64: string): Uint8Array => {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function safeDescribe(): string {
  try {
    return describePage()
  } catch {
    return ''
  }
}

export default defineContentScript({
  matches: ['*://studio.youtube.com/*'],
  main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.kind !== 'zaviya' || typeof msg.action !== 'string' || !msg.action.startsWith('youtube.')) return
      void handle(msg)
        .then(sendResponse)
        .catch((e) => {
          sendResponse({ error: e instanceof Error ? e.message : String(e), page: safeDescribe() })
        })
      return true
    })
  },
})

async function handle(msg: { action: string; size?: number; b64?: string; fileName?: string; title?: string; description?: string; syntheticMedia?: boolean }): Promise<unknown> {
  if (msg.action === 'youtube.begin') {
    chunks = []
    expected = msg.size ?? 0
    return { ok: true }
  }
  if (msg.action === 'youtube.chunk') {
    chunks.push(b64ToBytes(msg.b64 ?? ''))
    return { ok: true }
  }
  if (msg.action === 'youtube.upload') {
    const have = chunks.reduce((n, c) => n + c.length, 0)
    if (!have || have !== expected) throw new StudioError('buffer_lost', `have ${have} of ${expected} bytes (the page reloaded?)`)
    const file = new File(chunks as BlobPart[], msg.fileName || 'zaviya.mp4', { type: 'video/mp4' })
    chunks = []
    return uploadToStudio({ file, title: msg.title ?? '', description: msg.description ?? '', syntheticMedia: !!msg.syntheticMedia }, (s) => console.log('[zaviya] youtube:', s))
  }
  throw new Error('unknown_action')
}
