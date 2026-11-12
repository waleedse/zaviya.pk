/**
 * YouTube Studio upload, driven from a content script on studio.youtube.com in the logged-in Chrome (no Data API: unverified
 * API projects upload as private). Studio changes its markup now and then, so every step finds elements by several selectors
 * and by visible text, waits for them, and on failure says exactly where it stopped and what the dialog showed.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class StudioError extends Error {
  constructor(
    readonly code: string,
    detail = '',
  ) {
    super(detail ? `${code}: ${detail}` : code)
  }
}

export async function waitFor<T>(find: () => T | null | undefined | false, timeoutMs: number, code: string, detail = ''): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = find()
    if (found) return found
    if (Date.now() >= deadline) throw new StudioError(code, detail)
    await sleep(400)
  }
}

const visible = (el: Element): boolean => {
  const r = (el as HTMLElement).getBoundingClientRect?.()
  return !!r && r.width > 0 && r.height > 0
}

/** First element of the selectors (in order) that is on screen */
export function pick(selectors: string[], root: ParentNode = document): HTMLElement | null {
  for (const sel of selectors) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(sel))) if (visible(el)) return el
  }
  return null
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

const CLICKABLE = 'button, ytcp-button, tp-yt-paper-button, a, [role="button"], tp-yt-paper-radio-button, [role="radio"], [role="menuitem"], tp-yt-paper-item'

/** A visible button-like element whose text or aria-label matches */
export function byText(re: RegExp, tags = CLICKABLE): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(tags))) {
    if (!visible(el)) continue
    if (re.test(norm(el.innerText || el.textContent)) || re.test(norm(el.getAttribute('aria-label')))) return el
  }
  return null
}

export function isDisabled(el: HTMLElement): boolean {
  return el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled')
}

export function dialogText(): string {
  const d = document.querySelector<HTMLElement>('ytcp-uploads-dialog, tp-yt-paper-dialog[opened], ytcp-dialog')
  return norm(d?.innerText ?? document.body?.innerText).slice(0, 1500)
}

const LIMIT_RE = /daily upload limit|upload limit (has been )?reached|reached (your|the) (daily )?upload limit|upload limit/i
const VERIFY_RE = /verify (your )?(phone|identity|account)|verify it'?s you|confirm (it'?s|that it'?s) you|enter (a )?phone number|intermediate features|advanced features/i

/** Studio's own refusal messages, so the worker can pause instead of retrying blindly */
export function studioProblem(): StudioError | null {
  const dialog = dialogText()
  if (LIMIT_RE.test(dialog)) return new StudioError('daily_limit_reached', dialog.slice(0, 300))
  if (VERIFY_RE.test(dialog)) return new StudioError('needs_human_verification', dialog.slice(0, 300))
  if (/accounts\.google\.com/.test(location.href)) return new StudioError('needs_human_login', location.href)
  return null
}

/** What the page shows right now: for the failure log (the screenshot is taken by the background page) */
export function describePage(): string {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>(CLICKABLE))
    .filter(visible)
    .map((b) => norm(b.getAttribute('aria-label') || b.innerText || b.getAttribute('name')))
    .filter(Boolean)
    .slice(0, 25)
  return `url=${location.pathname.slice(0, 80)} tab=${document.visibilityState} dialog="${dialogText().slice(0, 350)}" buttons=[${buttons.join(' | ').slice(0, 500)}]`
}

function setEditable(box: HTMLElement, text: string): void {
  box.focus()
  const sel = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(box)
  sel?.removeAllRanges()
  sel?.addRange(range)
  document.execCommand('delete')
  text.split('\n').forEach((line, i) => {
    if (i > 0) document.execCommand('insertLineBreak')
    if (line) document.execCommand('insertText', false, line)
  })
  box.dispatchEvent(new Event('input', { bubbles: true }))
}

async function fillBox(find: () => HTMLElement | null, text: string, what: string): Promise<void> {
  const box = await waitFor(find, 30_000, 'textbox_not_found', what)
  for (let attempt = 0; attempt < 3; attempt++) {
    setEditable(box, text)
    await sleep(500)
    const want = norm(text)
    if (norm(box.innerText).startsWith(want.slice(0, Math.min(15, want.length)))) return
  }
  throw new StudioError('textbox_not_filled', what)
}

/** videoId from any youtube link form */
export function videoIdFrom(url: string): string | null {
  const m = /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/video\/)([A-Za-z0-9_-]{11})/.exec(url)
  return m?.[1] ?? null
}

function currentVideoLink(): string | null {
  for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="youtu.be/"], a[href*="youtube.com/watch"], a[href*="youtube.com/shorts/"]'))) {
    if (videoIdFrom(a.href)) return a.href
  }
  const m = /https?:\/\/(?:youtu\.be\/|www\.youtube\.com\/(?:watch\?v=|shorts\/))[A-Za-z0-9_-]{11}/.exec(document.body?.innerText ?? '')
  return m?.[0] ?? null
}

export interface UploadInput {
  file: File
  title: string
  description: string
  syntheticMedia: boolean
}

export async function uploadToStudio(input: UploadInput, log: (s: string) => void = () => undefined): Promise<{ videoId: string; url: string; visibility: string }> {
  const guard = () => {
    const p = studioProblem()
    if (p) throw p
  }
  guard()

  // 1. the upload dialog. 13 Nov: Studio no longer opens it from the bare /videos/upload path (it lands on "Channel content" with no
  // dialog), and a stray hidden <input type=file> elsewhere on that page used to be taken for the dialog's, so the file went nowhere and
  // the run failed later with next_button_not_found. Only an input INSIDE the open upload dialog counts. Ways in, in order:
  //   (1) the background page opens .../videos/upload?d=ud, which shows the dialog when Studio honours it;
  //   (2) Create > Upload videos;
  //   (3) the "Upload videos" button on the empty Content page.
  const findInput = () => {
    const dialog = pick(['ytcp-uploads-dialog'])
    if (!dialog) return null
    return dialog.querySelector<HTMLInputElement>('input[type="file"]') ?? document.querySelector<HTMLInputElement>('ytcp-uploads-file-picker input[type="file"]')
  }
  const waitInput = (ms: number, detail = '') =>
    waitFor(() => {
      guard()
      return findInput()
    }, ms, 'file_input_not_found', detail)
  let fileEl: HTMLInputElement
  try {
    fileEl = await waitInput(10_000)
  } catch (e) {
    if (!(e instanceof StudioError) || e.code !== 'file_input_not_found') throw e
    log('no dialog from ?d=ud: opening it from the Create menu')
    try {
      const create = await waitFor(() => pick(['#create-icon', 'ytcp-button#create-icon', '[aria-label="Create"]']) ?? byText(/^create$/i), 15_000, 'create_button_not_found', describePage())
      create.click()
      const item = await waitFor(() => pick(['#text-item-0', 'tp-yt-paper-item#text-item-0']) ?? byText(/upload videos?/i), 8_000, 'upload_menu_not_found', describePage())
      item.click()
      fileEl = await waitInput(15_000)
    } catch (e2) {
      if (!(e2 instanceof StudioError) || !/^(file_input_not_found|create_button_not_found|upload_menu_not_found)$/.test(e2.code)) throw e2
      log('Create menu did not open it: clicking "Upload videos" on the page')
      const button = await waitFor(() => byText(/^upload videos?$/i), 10_000, 'upload_menu_not_found', describePage())
      button.click()
      fileEl = await waitInput(20_000, dialogText().slice(0, 200))
    }
  }

  // 2. hand the file over exactly like a pick from the file dialog would
  const dt = new DataTransfer()
  dt.items.add(input.file)
  fileEl.files = dt.files
  fileEl.dispatchEvent(new Event('input', { bubbles: true }))
  fileEl.dispatchEvent(new Event('change', { bubbles: true }))
  log('file handed to Studio')

  // 3. details: title and description are the editable boxes of the dialog, in that order
  const boxes = () => Array.from(document.querySelectorAll<HTMLElement>('ytcp-uploads-dialog [contenteditable="true"], ytcp-uploads-details [contenteditable="true"]')).filter(visible)
  await waitFor(
    () => {
      guard()
      return boxes().length >= 2 || null
    },
    90_000,
    'details_not_shown',
    dialogText().slice(0, 300),
  )
  await fillBox(() => pick(['#title-textarea #textbox', '#title-textarea [contenteditable="true"]']) ?? boxes()[0] ?? null, input.title, 'title')
  await fillBox(() => pick(['#description-textarea #textbox', '#description-textarea [contenteditable="true"]']) ?? boxes()[1] ?? null, input.description, 'description')
  log('title and description set')

  // 4. audience: "No, it's not made for kids"
  const notKids = await waitFor(
    () => pick(['tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]', '[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]']) ?? byText(/no,? it'?s not made for kids/i),
    20_000,
    'kids_radio_not_found',
    describePage(),
  )
  notKids.scrollIntoView({ block: 'center' })
  notKids.click()
  await sleep(500)

  // 4b. "Altered or synthetic content" (newer Studio versions): answered truthfully, only if the question is there
  const altered = pick([input.syntheticMedia ? '[name="VIDEO_HAS_ALTERED_CONTENT_YES"]' : '[name="VIDEO_HAS_ALTERED_CONTENT_NO"]'])
  if (altered) {
    altered.click()
    await sleep(400)
  }
  guard()

  // 5. Next until the visibility step; the Next button can be disabled for a moment while Studio checks the video
  const vis = () => pick(['tp-yt-paper-radio-button[name="PUBLIC"]', '[name="PUBLIC"]'])
  for (let i = 0; i < 6 && !vis(); i++) {
    const next = await waitFor(() => pick(['#next-button', 'ytcp-button#next-button']) ?? byText(/^next$/i), 30_000, 'next_button_not_found', describePage())
    await waitFor(() => !isDisabled(next) || null, 120_000, 'next_button_disabled', dialogText().slice(0, 300))
    next.click()
    await sleep(1_500)
    guard()
  }

  // 6. visibility Public
  const pub = await waitFor(vis, 30_000, 'visibility_step_not_found', describePage())
  pub.click()
  await sleep(600)
  if (!(pub.getAttribute('aria-checked') === 'true' || pub.hasAttribute('checked'))) throw new StudioError('public_not_selected', describePage())
  log('visibility public')

  // 7. publish once the upload itself has finished (Done is disabled while the bytes are still going up)
  const earlyLink = currentVideoLink()
  const done = await waitFor(() => pick(['#done-button', 'ytcp-button#done-button']) ?? byText(/^(publish|save|done)$/i), 30_000, 'done_button_not_found', describePage())
  await waitFor(
    () => {
      guard()
      return !isDisabled(done) || null
    },
    15 * 60_000,
    'upload_not_finished',
    dialogText().slice(0, 300),
  )
  done.click()
  log('publish clicked')

  // 8. the "Video published" dialog carries the link; fall back to the one seen in the details pane
  let link: string | null = null
  try {
    link = await waitFor(() => currentVideoLink(), 60_000, 'published_link_not_found')
  } catch {
    link = earlyLink
  }
  if (!link || !videoIdFrom(link)) throw new StudioError('post_unsure_no_link', `publish was clicked but no video link was seen. ${describePage()}`)
  const videoId = videoIdFrom(link)!
  // close the dialog so the next job starts clean
  pick(['#close-button', 'ytcp-button#close-button', '[aria-label="Close"]'])?.click()
  return { videoId, url: `https://www.youtube.com/watch?v=${videoId}`, visibility: 'public' }
}
