/**
 * Drives gemini.google.com (logged-in session) to generate one image.
 * Gemini's markup changes often, so every lookup tries a list of selectors,
 * and the lists can be overridden from the options page without a rebuild.
 */

export interface GeminiSelectors {
  editor: string[]
  sendButton: string[]
  responseImage: string[]
  stopButton: string[]
}

export const DEFAULT_GEMINI_SELECTORS: GeminiSelectors = {
  editor: [
    'rich-textarea .ql-editor[contenteditable="true"]',
    'div.ql-editor[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    'textarea[aria-label*="prompt" i]',
    'textarea',
  ],
  sendButton: [
    'button.send-button:not([disabled])',
    'button[aria-label*="Send message" i]:not([disabled])',
    'button[aria-label*="Send" i]:not([disabled])',
    'button[data-test-id="send-button"]:not([disabled])',
  ],
  responseImage: [
    'model-response generated-image img',
    'model-response single-image img',
    'generated-image img',
    'single-image img',
    'model-response img',
    'message-content img',
    'model-response img[src*="googleusercontent.com"]',
  ],
  stopButton: ['model-response button[aria-label*="Stop" i]', 'button.send-button.stop', 'button[aria-label*="Stop response" i]', 'button[aria-label*="Stop generating" i]'],
}

export interface GeneratedImage {
  /** data: URL when the page could read the pixels itself */
  dataUrl?: string
  /** remote URL for the background worker to fetch with host permissions */
  url?: string
  width: number
  height: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Hidden elements (display:none, detached menus) must not count, or a stray "Stop" button blocks forever. */
function isVisible(el: Element): boolean {
  const r = (el as HTMLElement).getBoundingClientRect?.()
  return Boolean(r && r.width > 0 && r.height > 0)
}

function queryVisible(selectors: string[]): Element | null {
  for (const sel of selectors) {
    try {
      for (const el of Array.from(document.querySelectorAll(sel))) if (isVisible(el)) return el
    } catch {
      /* invalid user-supplied selector */
    }
  }
  return null
}

function queryFirst<T extends Element>(selectors: string[]): T | null {
  for (const sel of selectors) {
    try {
      const el = document.querySelector<T>(sel)
      if (el) return el
    } catch {
      /* invalid user-supplied selector */
    }
  }
  return null
}

function queryAll(selectors: string[]): HTMLImageElement[] {
  const seen = new Set<HTMLImageElement>()
  for (const sel of selectors) {
    try {
      for (const el of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) seen.add(el)
    } catch {
      /* ignore */
    }
  }
  return [...seen]
}

export function detectGeminiProblem(): string | null {
  if (/accounts\.google\.com/.test(location.host)) return 'gemini_not_logged_in'
  const text = document.body?.innerText ?? ''
  if (/sign in to continue|sign in to gemini/i.test(text) && !queryFirst(DEFAULT_GEMINI_SELECTORS.editor)) {
    return 'gemini_not_logged_in'
  }
  if (/unusual traffic|verify (that )?you('| a)re (not a robot|human)|captcha/i.test(text)) return 'checkpoint_detected'
  return null
}

/** Last model turn's text, used to spot refusals and quota messages. */
function lastResponseText(): string {
  const turns = document.querySelectorAll('model-response, message-content, .model-response-text')
  const last = turns[turns.length - 1] as HTMLElement | undefined
  return last?.innerText ?? ''
}

const LIMIT_RE = /(reached|hit) (your|the) (daily |image )?(limit|quota)|try again (later|tomorrow)|limit for image generation/i
const REFUSAL_RE = /can['’]t (create|generate|make)|unable to (create|generate)|not able to (create|generate)|I can['’]t help with that/i

function isUsableImage(img: HTMLImageElement): boolean {
  const src = img.currentSrc || img.src
  if (!src || src.startsWith('data:image/svg')) return false
  // Avatars and icons are small; generated images are at least ~512px.
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  return img.complete && w >= 256 && h >= 256
}

/** Ask the background worker for trusted input on this tab; false when the debugger is unavailable. */
type TrustedCmd =
  | { action: 'insertText'; text: string }
  | { action: 'pressEnter' }
  | { action: 'clickAt'; x: number; y: number }
  | { action: 'beginVisible' }
  | { action: 'endVisible' }

async function trustedCall(cmd: TrustedCmd): Promise<{ ok?: boolean; visibility?: string; error?: string }> {
  try {
    return ((await chrome.runtime.sendMessage({ kind: 'zaviya-cdp', cmd })) as { ok?: boolean; visibility?: string; error?: string }) ?? {}
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function trusted(cmd: TrustedCmd): Promise<boolean> {
  return Boolean((await trustedCall(cmd)).ok)
}

async function clearEditor(editor: HTMLElement): Promise<void> {
  editor.focus()
  if (editor instanceof HTMLTextAreaElement) editor.value = ''
  else {
    document.execCommand('selectAll', false)
    document.execCommand('delete', false)
  }
}

async function typePrompt(editor: HTMLElement, prompt: string): Promise<boolean> {
  // Trusted typing first: Gemini's composer only enables a real send for genuine input.
  await clearEditor(editor)
  if (await trusted({ action: 'insertText', text: prompt })) {
    await sleep(300)
    const got = (editor.innerText || (editor as HTMLTextAreaElement).value || '').trim()
    if (got.length >= prompt.length * 0.8) return true
  }
  editor.focus()
  if (editor instanceof HTMLTextAreaElement) {
    editor.value = prompt
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    return false
  }
  // Quill editor: execCommand keeps its internal model in sync.
  document.execCommand('selectAll', false)
  document.execCommand('insertText', false, prompt)
  editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
  return false
}

async function readAsDataUrl(img: HTMLImageElement): Promise<string | undefined> {
  const src = img.currentSrc || img.src
  try {
    if (src.startsWith('data:')) return src
    // blob: and same-origin URLs are readable from the page. Never wait forever on a stalled download.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20_000)
    const res = await fetch(src, { credentials: 'include', signal: ctrl.signal }).finally(() => clearTimeout(timer))
    if (!res.ok) return undefined
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(r.error)
      r.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

/**
 * Keeps this (usually background) tab rendering for the whole generation, because Gemini's
 * composer does nothing while Chrome treats the tab as hidden.
 */
export async function generateImage(
  prompt: string,
  opts: { selectors?: Partial<GeminiSelectors>; timeoutMs?: number } = {},
): Promise<GeneratedImage> {
  const begin = await trustedCall({ action: 'beginVisible' })
  // Give the page a moment to resume rendering before typing.
  await sleep(1500)
  try {
    return await runGeneration(prompt, opts, { visibleSession: begin.ok ? begin.visibility ?? 'unknown' : `failed: ${begin.error ?? 'no reply'}` })
  } finally {
    await trustedCall({ action: 'endVisible' })
  }
}

async function runGeneration(
  prompt: string,
  opts: { selectors?: Partial<GeminiSelectors>; timeoutMs?: number },
  ctx: { visibleSession: string },
): Promise<GeneratedImage> {
  const sel: GeminiSelectors = { ...DEFAULT_GEMINI_SELECTORS, ...opts.selectors }
  const timeoutMs = opts.timeoutMs ?? 180_000

  const problem = detectGeminiProblem()
  if (problem) throw new Error(problem)

  // The app shell renders after load; wait for the composer.
  let editor: HTMLElement | null = null
  for (let i = 0; i < 40 && !editor; i++) {
    editor = queryFirst<HTMLElement>(sel.editor)
    if (!editor) await sleep(500)
  }
  if (!editor) throw new Error('gemini_editor_not_found')

  const before = new Set(queryAll(sel.responseImage).map((i) => i.currentSrc || i.src))

  const typedTrusted = await typePrompt(editor, prompt)
  await sleep(600)

  const editorText = () => (editor!.innerText || (editor as HTMLTextAreaElement).value || '').trim()
  const typed = editorText().length
  if (!typed) throw new Error('gemini_type_failed')

  const turnsBefore = document.querySelectorAll('user-query, .user-query, [data-test-id="user-query"]').length
  const sent = () => editorText().length < typed / 3 || document.querySelectorAll('user-query, .user-query, [data-test-id="user-query"]').length > turnsBefore

  // Gemini's send button reacts to real pointer sequences, not a bare .click().
  const realClick = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const opts = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 }
    el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' }))
    el.dispatchEvent(new MouseEvent('mousedown', opts))
    el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse' }))
    el.dispatchEvent(new MouseEvent('mouseup', opts))
    el.click()
  }
  const pressEnter = () => {
    editor!.focus()
    for (const type of ['keydown', 'keypress', 'keyup'] as const) {
      editor!.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }))
    }
  }

  let send: HTMLButtonElement | null = null
  for (let i = 0; i < 10 && !send; i++) {
    send = queryFirst<HTMLButtonElement>(sel.sendButton)
    if (send && (send.disabled || send.getAttribute('aria-disabled') === 'true')) send = null
    if (!send) await sleep(500)
  }
  // 1) trusted Enter (twice: the composer enables sending a moment after typing),
  // 2) trusted click on the send button, then the old synthetic fallbacks.
  const steps: Record<string, boolean> = {}
  await sleep(1000)
  for (let i = 0; i < 2 && !sent(); i++) {
    editor.focus()
    steps[`enter${i + 1}`] = await trusted({ action: 'pressEnter' })
    await sleep(2500)
  }
  if (!sent()) {
    send = queryFirst<HTMLButtonElement>(sel.sendButton) ?? send
    if (send) {
      send.scrollIntoView({ block: 'center' })
      await sleep(200)
      const r = send.getBoundingClientRect()
      steps.click = await trusted({ action: 'clickAt', x: r.left + r.width / 2, y: r.top + r.height / 2 })
      await sleep(2500)
    }
  }
  if (!sent() && send) {
    realClick(send)
    await sleep(2500)
  }
  if (!sent()) {
    pressEnter()
    await sleep(2500)
  }
  if (!sent() && send) {
    send.click()
    await sleep(2500)
  }
  if (!sent()) {
    throw new Error(`gemini_send_failed ${JSON.stringify({ typedChars: typed, editorAfter: editorText().length, sendButton: Boolean(send), sendLabel: send?.getAttribute('aria-label') ?? null, sendDisabled: send?.disabled ?? null, trusted: steps, typedTrusted, visible: document.visibilityState, visibleSession: ctx.visibleSession, url: location.pathname })}`)
  }

  const deadline = Date.now() + timeoutMs
  // An image that has stayed the same for a few polls is final, even if a "Stop" control is still on screen.
  let lastSeen = ''
  let stablePolls = 0
  while (Date.now() < deadline) {
    await sleep(2000)
    const problemNow = detectGeminiProblem()
    if (problemNow) throw new Error(problemNow)

    const fresh = queryAll(sel.responseImage).filter((img) => !before.has(img.currentSrc || img.src) && isUsableImage(img))
    const stillGenerating = Boolean(queryVisible(sel.stopButton))
    const key = fresh.map((i) => i.currentSrc || i.src).join('|')
    stablePolls = key && key === lastSeen ? stablePolls + 1 : 0
    lastSeen = key
    if (fresh.length && (!stillGenerating || stablePolls >= 3)) {
      const best = fresh.sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)[0]!
      const dataUrl = await readAsDataUrl(best)
      return {
        dataUrl,
        url: dataUrl ? undefined : best.currentSrc || best.src,
        width: best.naturalWidth,
        height: best.naturalHeight,
      }
    }

    if (!stillGenerating) {
      const reply = lastResponseText()
      if (LIMIT_RE.test(reply)) throw new Error('gemini_limit_reached')
      if (REFUSAL_RE.test(reply)) throw new Error('gemini_refused')
    }
  }
  // Say what we saw, so selector problems can be fixed from the worker log alone.
  const imgs = Array.from(document.querySelectorAll('img'))
  const big = imgs.filter((i) => (i.naturalWidth || i.width) >= 256)
  const diag = {
    typedChars: typed,
    sendButton: Boolean(send),
    userTurns: document.querySelectorAll('user-query, .user-query, [data-test-id="user-query"]').length,
    modelTurns: document.querySelectorAll('model-response, .model-response').length,
    url: location.pathname,
    responseImgs: queryAll(sel.responseImage).length,
    stopVisible: Boolean(queryVisible(sel.stopButton)),
    visible: document.visibilityState,
    visibleSession: ctx.visibleSession,
    pageImgs: imgs.length,
    bigImgs: big.map((i) => `${i.closest('[class]')?.tagName.toLowerCase()}.${(i.parentElement?.className || '').toString().slice(0, 40)}:${i.naturalWidth}x${i.naturalHeight}:${(i.currentSrc || i.src).slice(0, 40)}`).slice(0, 4),
    reply: lastResponseText().slice(0, 160),
  }
  throw new Error(`gemini_image_timeout ${JSON.stringify(diag)}`)
}
