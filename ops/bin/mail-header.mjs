// RFC 5322 display-name handling for mail.mjs (kept apart so it can be unit-tested without running the CLI).
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')

/** Plain ASCII passes through; anything else becomes an RFC 2047 encoded word. */
export const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`)

/** "Zaviya <name>" unless the name already says Zaviya; a call-site --from-name is used as given. */
export function displayName(name, fromName) {
  const full = (fromName || '').trim() || (/zaviya/i.test(name || '') ? name.trim() : `Zaviya ${(name || 'Agent').trim()}`)
  return full
}

/** The From header value: the display name as a quoted string (so commas stay inside it), then the address. */
export function fromHeader(name, fromName, address) {
  const full = displayName(name, fromName)
  const quoted = /^[\x20-\x7e]*$/.test(full) ? `"${full.replace(/[\\"]/g, '\\$&')}"` : encWord(full)
  return `${quoted} <${address}>`
}
