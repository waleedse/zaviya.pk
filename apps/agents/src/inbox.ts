/**
 * Inbox: Waleed's comments on Linear wake the Product Manager. Agents and Waleed share one Linear
 * account, so agent comments carry a 🤖 mark (ops/bin/linear.mjs signs them); anything without the
 * mark, and not in an older agent format, is treated as Waleed talking.
 */

export interface LinearComment {
  id: string
  body: string
  createdAt: string
  issue: { identifier: string; title: string } | null
}

export const AGENT_MARK = '🤖'

/** Openings used by agent comments written before the 🤖 signature existed */
const LEGACY_AGENT_OPENINGS =
  /^\s*(\*\*)?(PM: |Editor, |Editor desk|Engineer diagnosis|SEO: |Social: |Merged #|PR: |\[watchdog\]|\[on-duty\]|Recovered at |Still happening|Context \(Claude\)|Root cause \(Claude|Desk check|Opened by the watchdog)/

export function isFromAgent(body: string): boolean {
  return body.includes(AGENT_MARK) || LEGACY_AGENT_OPENINGS.test(body)
}

export async function fetchCommentsSince(since: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<LinearComment[]> {
  const res = await fetchImpl('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey },
    body: JSON.stringify({
      query: `query($since: DateTimeOrDuration!) { comments(first: 50, orderBy: createdAt, filter: { createdAt: { gt: $since } }) {
        nodes { id body createdAt issue { identifier title } } } }`,
      variables: { since },
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const json = (await res.json()) as { data?: { comments: { nodes: LinearComment[] } }; errors?: unknown }
  if (!json.data) throw new Error(`Linear comments query failed: ${JSON.stringify(json.errors).slice(0, 300)}`)
  return json.data.comments.nodes
}

/** Waleed's new comments, oldest first, that have not been answered yet */
export function newHumanComments(comments: LinearComment[], seen: Set<string>): LinearComment[] {
  return comments
    .filter((c) => c.issue && !seen.has(c.id) && !isFromAgent(c.body))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function inboxPrompt(c: LinearComment): string {
  const id = c.issue!.identifier
  return [
    `Waleed (the owner) just commented on Linear issue ${id} ("${c.issue!.title}"):`,
    '"""',
    c.body.slice(0, 4000),
    '"""',
    '',
    `1. Read the issue and its comments: node ops/bin/linear.mjs get ${id}`,
    '2. Do what he asks, within your powers as Product Manager: answer questions with real data (site and Payload API, web search),',
    '   change labels, state or priority, approve safe and reversible engineering work with `pm-approved` and route it by label',
    '   (`engineer`, `editor`, `seo`, `social`), or open follow-up issues. You cannot deploy, edit code or touch servers.',
    '   The engineer agent runs every 2 hours and ships `engineer` + `pm-approved` Todo issues; the PM on-duty check (every 30 min) wakes it sooner for incidents.',
    '   Risky work (migrations, auth, secrets, deletes, spending) needs his explicit yes: ask him.',
    `3. Reply on ${id} with ONE comment: node ops/bin/linear.mjs comment ${id} --body "..."`,
    '   Say what you understood, what you did, and what happens next and when. Short and plain; write in Roman Urdu if he did.',
    'Never print secrets. Finish with one line saying what you replied.',
  ].join('\n')
}
