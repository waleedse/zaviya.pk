import { generateImage, detectGeminiProblem, type GeminiSelectors } from '../lib/gemini-dom'

export default defineContentScript({
  matches: ['*://gemini.google.com/*'],
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
  prompt?: string
  selectors?: Partial<GeminiSelectors>
  timeoutMs?: number
}): Promise<unknown> {
  if (msg.action === 'gemini.ping') return { ok: true, problem: detectGeminiProblem() }
  if (msg.action === 'gemini.generateImage') {
    if (!msg.prompt) throw new Error('missing_prompt')
    return generateImage(msg.prompt, { selectors: msg.selectors, timeoutMs: msg.timeoutMs })
  }
  throw new Error('unknown_action')
}
