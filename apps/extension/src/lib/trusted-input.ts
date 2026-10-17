/**
 * Real (trusted) input and "keep this tab rendering" through the Chrome DevTools Protocol.
 *
 * Gemini ignores synthetic events from content scripts, and in a background tab Chrome pauses
 * rendering, so its composer never actually sends. While an image is being made we attach the
 * debugger and run a tiny screencast: a captured tab counts as visible, so the page keeps working
 * without stealing the user's current tab. Chrome shows its "is debugging this browser" bar meanwhile.
 */

export type CdpAction =
  | { action: 'insertText'; text: string }
  | { action: 'pressEnter' }
  | { action: 'pressEscape' }
  | { action: 'clickAt'; x: number; y: number }
  | { action: 'beginVisible' }
  | { action: 'endVisible' }

interface Session {
  /** Kept attached while an image is being generated */
  visible: boolean
  timer?: ReturnType<typeof setTimeout>
}

const sessions = new Map<number, Session>()
const MAX_VISIBLE_MS = 6 * 60_000

const send = (tabId: number, method: string, params: object = {}) => chrome.debugger.sendCommand({ tabId }, method, params)

let listening = false
function listen() {
  if (listening) return
  listening = true
  // Acknowledge frames so the screencast (and therefore rendering) keeps going.
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (method === 'Page.screencastFrame' && source.tabId !== undefined) {
      const sessionId = (params as { sessionId?: number } | undefined)?.sessionId
      if (sessionId !== undefined) void send(source.tabId, 'Page.screencastFrameAck', { sessionId }).catch(() => undefined)
    }
  })
  chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId !== undefined) {
      const s = sessions.get(source.tabId)
      if (s?.timer) clearTimeout(s.timer)
      sessions.delete(source.tabId)
    }
  })
}

async function attach(tabId: number): Promise<Session> {
  listen()
  let s = sessions.get(tabId)
  if (!s) {
    await chrome.debugger.attach({ tabId }, '1.3')
    s = { visible: false }
    sessions.set(tabId, s)
  }
  return s
}

async function detach(tabId: number) {
  const s = sessions.get(tabId)
  if (s?.timer) clearTimeout(s.timer)
  sessions.delete(tabId)
  await chrome.debugger.detach({ tabId }).catch(() => undefined)
}

async function endVisible(tabId: number) {
  await send(tabId, 'Page.stopScreencast').catch(() => undefined)
  await detach(tabId)
}

export async function runTrustedInput(tabId: number, cmd: CdpAction): Promise<{ ok: true; visibility?: string }> {
  if (cmd.action === 'endVisible') {
    await endVisible(tabId)
    return { ok: true }
  }
  const s = await attach(tabId)
  try {
    if (cmd.action === 'beginVisible') {
      s.visible = true
      // Never leave the debugger attached if the page forgets to say it is done.
      if (s.timer) clearTimeout(s.timer)
      s.timer = setTimeout(() => void endVisible(tabId), MAX_VISIBLE_MS)
      await send(tabId, 'Page.enable')
      await send(tabId, 'Page.startScreencast', { format: 'jpeg', quality: 10, maxWidth: 320, maxHeight: 240, everyNthFrame: 30 })
      const res = (await send(tabId, 'Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true })) as { result?: { value?: string } }
      return { ok: true, visibility: res?.result?.value }
    }
    if (cmd.action === 'insertText') {
      await send(tabId, 'Input.insertText', { text: cmd.text })
    } else if (cmd.action === 'pressEnter') {
      const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }
      await send(tabId, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
      await send(tabId, 'Input.dispatchKeyEvent', { type: 'char', text: '\r', ...key })
      await send(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    } else if (cmd.action === 'pressEscape') {
      const key = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }
      await send(tabId, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
      await send(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    } else if (cmd.action === 'clickAt') {
      const base = { x: cmd.x, y: cmd.y, button: 'left', clickCount: 1 }
      await send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: cmd.x, y: cmd.y })
      await send(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...base })
      await send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...base })
    }
    return { ok: true }
  } finally {
    // One-off inputs outside a visible session release the debugger straight away.
    if (!s.visible && sessions.has(tabId)) await detach(tabId)
  }
}
