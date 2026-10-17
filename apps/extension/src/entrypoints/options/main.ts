import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../../lib/storage'

const bridgeUrl = document.getElementById('bridgeUrl') as HTMLInputElement
const bridgeToken = document.getElementById('bridgeToken') as HTMLInputElement
const platformX = document.getElementById('platformX') as HTMLInputElement
const platformInstagram = document.getElementById('platformInstagram') as HTMLInputElement
const platformFacebook = document.getElementById('platformFacebook') as HTMLInputElement
const platformGemini = document.getElementById('platformGemini') as HTMLInputElement
const geminiSelectors = document.getElementById('geminiSelectors') as HTMLTextAreaElement
const testPrompt = document.getElementById('testPrompt') as HTMLInputElement
const testGemini = document.getElementById('testGemini') as HTMLButtonElement
const testStatus = document.getElementById('testStatus')!
const testImage = document.getElementById('testImage') as HTMLImageElement
const conn = document.getElementById('conn')!
const delayMin = document.getElementById('delayMin') as HTMLInputElement
const delayMax = document.getElementById('delayMax') as HTMLInputElement
const saveBtn = document.getElementById('save') as HTMLButtonElement
const status = document.getElementById('status')!

async function load(): Promise<void> {
  const s = await getSettings()
  bridgeUrl.value = s.bridgeUrl
  bridgeToken.value = s.bridgeToken
  platformX.checked = s.platforms.x
  platformInstagram.checked = s.platforms.instagram
  platformFacebook.checked = s.platforms.facebook
  platformGemini.checked = s.platforms.gemini
  geminiSelectors.value = s.geminiSelectorsJson
  delayMin.value = String(s.actionDelayMinMs)
  delayMax.value = String(s.actionDelayMaxMs)
}

saveBtn.addEventListener('click', async () => {
  await saveSettings({
    bridgeUrl: bridgeUrl.value.trim() || DEFAULT_SETTINGS.bridgeUrl,
    bridgeToken: bridgeToken.value.trim(),
    platforms: {
      x: platformX.checked,
      instagram: platformInstagram.checked,
      facebook: platformFacebook.checked,
      gemini: platformGemini.checked,
    },
    geminiSelectorsJson: geminiSelectors.value.trim(),
    actionDelayMinMs: Number(delayMin.value) || DEFAULT_SETTINGS.actionDelayMinMs,
    actionDelayMaxMs: Number(delayMax.value) || DEFAULT_SETTINGS.actionDelayMaxMs,
  })
  status.textContent = 'Saved. Background will reconnect if URL/token changed.'
})

testGemini.addEventListener('click', async () => {
  testGemini.disabled = true
  testImage.style.display = 'none'
  testStatus.textContent = 'Opening Gemini and generating… (up to 3 minutes)'
  const started = Date.now()
  try {
    const res = (await chrome.runtime.sendMessage({ kind: 'zaviya-options', action: 'testGemini', prompt: testPrompt.value })) as
      | { ok: true; base64: string; mimeType: string; width?: number; height?: number }
      | { ok: false; error: string }
    if (!res.ok) throw new Error(res.error)
    testImage.src = `data:${res.mimeType};base64,${res.base64}`
    testImage.style.display = 'block'
    testStatus.textContent = `Done in ${Math.round((Date.now() - started) / 1000)}s · ${res.width ?? '?'}×${res.height ?? '?'}`
  } catch (e) {
    testStatus.textContent = `Failed: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    testGemini.disabled = false
  }
})

async function refreshConn(): Promise<void> {
  try {
    const res = (await chrome.runtime.sendMessage({ kind: 'zaviya-options', action: 'status' })) as { connected: boolean }
    conn.textContent = res.connected ? 'connected' : 'not connected (is the worker running?)'
  } catch {
    conn.textContent = 'unknown'
  }
}

void load()
void refreshConn()
setInterval(() => void refreshConn(), 5000)

const RESULT_TEXT: Record<string, string> = {
  retry_ok: 'fixed, job went through',
  retry_failed: 'retried, still failing',
  not_retried: 'looked, nothing to fix',
  refused: 'refused (not allowed)',
  needs_human: 'needs you (email sent)',
  limit_reached: 'limit reached (email sent)',
}

async function showHealLog(): Promise<void> {
  try {
    const res = (await chrome.runtime.sendMessage({ kind: 'zaviya-options', action: 'healLog' })) as {
      log: { at: number; jobType: string; platform: string; diagnosis: string; action: string; result: string }[]
    }
    const body = document.querySelector('#healLog tbody')!
    body.textContent = ''
    for (const e of res.log) {
      const tr = document.createElement('tr')
      // textContent only: the diagnosis comes from a model and from page text
      for (const text of [new Date(e.at).toLocaleString(), e.jobType, e.action, RESULT_TEXT[e.result] ?? e.result, e.diagnosis]) {
        const td = document.createElement('td')
        td.textContent = text
        td.style.cssText = 'padding:3px 6px;border-top:1px solid #ddd;vertical-align:top'
        tr.appendChild(td)
      }
      body.appendChild(tr)
    }
    document.getElementById('healEmpty')!.style.display = res.log.length ? 'none' : 'block'
  } catch {
    /* background asleep: the next refresh shows it */
  }
}
void showHealLog()
setInterval(() => void showHealLog(), 10_000)
