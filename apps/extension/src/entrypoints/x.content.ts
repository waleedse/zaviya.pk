import { scrapeTimelinePosts, postTweet, detectCheckpoint } from '../lib/x-dom'

export default defineContentScript({
  matches: ['*://x.com/*', '*://twitter.com/*'],
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
  listUrl?: string
  sinceId?: string
  text?: string
  mediaUrls?: string[]
  delayMinMs?: number
  delayMaxMs?: number
}): Promise<unknown> {
  const delayMinMs = msg.delayMinMs ?? 2_000
  const delayMaxMs = msg.delayMaxMs ?? 5_000

  if (detectCheckpoint()) throw new Error('checkpoint_detected')

  if (msg.action === 'x.readList') {
    if (msg.listUrl && !location.href.startsWith(msg.listUrl.split('?')[0]!)) {
      location.href = msg.listUrl
      await new Promise((r) => setTimeout(r, 4_000))
    }
    window.scrollTo(0, document.body.scrollHeight)
    await new Promise((r) => setTimeout(r, 2_000))
    return { posts: scrapeTimelinePosts(msg.sinceId) }
  }

  if (msg.action === 'x.post') {
    if (!msg.text) throw new Error('missing_text')
    return postTweet(msg.text, msg.mediaUrls ?? [], delayMinMs, delayMaxMs)
  }

  throw new Error('unknown_action')
}
