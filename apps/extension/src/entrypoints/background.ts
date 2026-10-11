import { BridgeClient } from '../lib/bridge-client'
import { runBridgeJob } from '../lib/jobs'
import { runTrustedInput } from '../lib/trusted-input'

export default defineBackground(() => {
  const client = new BridgeClient((job) => runBridgeJob(job))
  client.start()
  // MV3 service workers sleep after ~30s idle; an alarm wakes it so the socket reconnects.
  chrome.alarms.create('zaviya-keepalive', { periodInMinutes: 0.5 })
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === 'zaviya-keepalive') client.ensureConnected()
  })

  // Options page: connection status and a manual Gemini test.
  // Content scripts ask for trusted typing/keys on their own tab (see lib/trusted-input.ts).
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.kind !== 'zaviya-cdp' || sender.tab?.id === undefined) return
    runTrustedInput(sender.tab.id, msg.cmd)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }))
    return true
  })

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.kind !== 'zaviya-options') return
    if (msg.action === 'status') {
      sendResponse({ connected: client.isAuthenticated() })
      return
    }
    if (msg.action === 'testGemini') {
      runBridgeJob({ id: `test_${Date.now()}`, type: 'gemini.image', payload: { prompt: String(msg.prompt ?? '') } })
        .then((r) => sendResponse({ ok: true, ...(r as object) }))
        .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }))
      return true
    }
  })
})
