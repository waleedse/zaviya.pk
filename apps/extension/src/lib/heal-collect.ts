import type { PageState } from '@zaviya/shared'

/**
 * Runs INSIDE the page (chrome.scripting.executeScript serialises it), so it must not use anything from outside
 * this function. Collects what a person would see: visible buttons and links with their text, whether they sit in a
 * dialog, the dialog and toast texts and the start of the page text. Read-only: it never clicks or types.
 */
export function collectInPage(): PageState {
  const MAX_ELEMENTS = 50
  const clean = (s: string | null | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
  const inViewport = (r: DOMRect) => r.width >= 6 && r.height >= 6 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
  const shown = (el: Element): boolean => {
    const r = el.getBoundingClientRect()
    if (!inViewport(r)) return false
    const st = getComputedStyle(el)
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) return false
    return true
  }
  const DIALOG_SEL = '[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]'
  const COOKIE_SEL = '[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [data-testid*="cookie" i]'

  const dialogs: string[] = []
  const seenText = new Set<string>()
  for (const d of Array.from(document.querySelectorAll(`${DIALOG_SEL}, ${COOKIE_SEL}`)).slice(0, 12)) {
    if (!shown(d)) continue
    const t = clean((d as HTMLElement).innerText, 500)
    if (t.length < 3 || seenText.has(t)) continue
    seenText.add(t)
    dialogs.push(t)
    if (dialogs.length >= 6) break
  }
  const toasts: string[] = []
  for (const t of Array.from(document.querySelectorAll('[role="alert"], [role="status"], [data-testid="toast"]')).slice(0, 12)) {
    if (!shown(t)) continue
    const s = clean((t as HTMLElement).innerText, 250)
    if (s && !toasts.includes(s)) toasts.push(s)
    if (toasts.length >= 6) break
  }

  const found: PageState['elements'] = []
  const candidates = document.querySelectorAll('button, a[href], [role="button"], input[type="button"], input[type="submit"], [role="menuitem"]')
  for (const el of Array.from(candidates)) {
    if (!shown(el)) continue
    const r = el.getBoundingClientRect()
    const e = el as HTMLElement
    const text = clean(e.innerText || (e as HTMLInputElement).value || e.textContent, 120)
    const ariaLabel = clean(e.getAttribute('aria-label'), 120)
    if (!text && !ariaLabel) continue
    found.push({
      i: 0,
      tag: el.tagName.toLowerCase(),
      text,
      ariaLabel,
      href: el instanceof HTMLAnchorElement ? el.href.slice(0, 500) : '',
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
      inDialog: Boolean(el.closest(`${DIALOG_SEL}, ${COOKIE_SEL}`)),
      visible: true,
    })
  }
  // Dialog controls first: they are what is in the way
  const ordered = [...found.filter((f) => f.inDialog), ...found.filter((f) => !f.inDialog)].slice(0, MAX_ELEMENTS)
  ordered.forEach((f, idx) => (f.i = idx))

  return {
    url: location.href.slice(0, 1000),
    title: clean(document.title, 300),
    elements: ordered,
    dialogs,
    toasts,
    pageText: clean(document.body?.innerText, 800),
  }
}
