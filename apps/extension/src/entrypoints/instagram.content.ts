import { postInstagram, detectCheckpoint } from '../lib/instagram-dom'

export default defineContentScript({
  matches: ['*://www.instagram.com/*'],
  main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.kind !== 'zaviya') return
      void handle(msg).then(sendResponse).catch((e) => {
        sendResponse({ error: e instanceof Error ? e.message : String(e) })
      })
      return true
    })
  },
})

async function handle(msg: {
  action: string
  caption?: string
  mediaUrls?: string[]
  delayMinMs?: number
  delayMaxMs?: number
}): Promise<unknown> {
  if (detectCheckpoint()) throw new Error('checkpoint_detected')
  if (msg.action === 'instagram.post') {
    return postInstagram(
      msg.caption ?? '',
      msg.mediaUrls ?? [],
      msg.delayMinMs ?? 2_000,
      msg.delayMaxMs ?? 5_000,
    )
  }
  throw new Error('unknown_action')
}
