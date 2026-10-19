#!/usr/bin/env node
// Off-server uptime check (ZAV-126). Runs on GitHub Actions, so it still works when our VPS is off.
//   uptime-check.mjs [--base https://zaviya.pk] [--wait 45]
// Probes the home page and a database-backed API route. If both probes fail twice in a row (--wait seconds
// apart) it opens a Linear issue labelled `incident` (or comments on the open one) and exits 1, so GitHub
// also emails the failed run: a path that does not depend on our VPS. When the site is back it comments the downtime.
// Secrets: LINEAR_API_KEY (GitHub Actions secret).

const API = 'https://api.linear.app/graphql'
const TITLE_PREFIX = '[Uptime]'
const DOWN = '[uptime:down]'
const UP = '[uptime:up]'
const MARK = '— 🤖 Uptime check (GitHub Actions)'

/** The probes: the page people see, and a route that needs the database */
export const probePaths = ['/', '/api/articles?limit=1&depth=0']

/** What to do now. `incident` is the open [Uptime] issue (or null) with its comments, oldest first. */
export function decide({ down, incident }) {
  const markers = (incident?.comments ?? []).map((c) => c.body).filter((b) => b.includes(DOWN) || b.includes(UP))
  const last = markers.at(-1)
  const isDown = last ? last.includes(DOWN) : Boolean(incident)
  if (down) {
    if (!incident) return { action: 'create' }
    return isDown ? { action: 'none' } : { action: 'comment-down' }
  }
  return incident && isDown ? { action: 'comment-up', since: sinceOf(last ?? '') ?? incident.createdAt } : { action: 'none' }
}

function sinceOf(body) {
  return body.match(/\[uptime:down\] (\S+)/)?.[1]
}

export function minutesBetween(fromIso, toIso) {
  return Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000))
}

async function probe(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'zaviya-uptime-check' } })
    return res.ok ? null : `HTTP ${res.status}`
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export async function check(base) {
  const failures = []
  for (const p of probePaths) {
    const err = await probe(`${base}${p}`)
    if (err) failures.push(`${p}: ${err}`)
  }
  return failures
}

async function gql(key, query, variables = {}) {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: key }, body: JSON.stringify({ query, variables }) })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

async function findIncident(key) {
  const d = await gql(
    key,
    `query($filter: IssueFilter) { issues(filter: $filter, first: 1, orderBy: createdAt) { nodes { id identifier url createdAt comments(first: 100) { nodes { body createdAt } } } } }`,
    {
      filter: {
        team: { key: { eq: process.env.LINEAR_TEAM_KEY ?? 'ZAV' } },
        title: { startsWith: TITLE_PREFIX },
        state: { type: { nin: ['completed', 'canceled'] } },
      },
    },
  )
  const i = d.issues.nodes[0]
  if (!i) return null
  return { id: i.id, identifier: i.identifier, url: i.url, createdAt: i.createdAt, comments: i.comments.nodes.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }
}

async function createIncident(key, title, body) {
  const t = (await gql(key, `query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id } } }`, { key: process.env.LINEAR_TEAM_KEY ?? 'ZAV' })).teams.nodes[0]
  const labels = (await gql(key, `query { issueLabels(first: 100) { nodes { id name } } }`)).issueLabels.nodes
  const incident = labels.find((l) => l.name.toLowerCase() === 'incident')
  const d = await gql(
    key,
    `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { identifier url } } }`,
    { input: { teamId: t.id, title, description: body, priority: 1, ...(incident ? { labelIds: [incident.id] } : {}) } },
  )
  return d.issueCreate.issue
}

async function addComment(key, issueId, body) {
  await gql(key, `mutation($i: CommentCreateInput!) { commentCreate(input: $i) { success } }`, { i: { issueId, body } })
}

async function main() {
  const argv = process.argv.slice(2)
  const arg = (name, dflt) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
  }
  const base = arg('base', 'https://zaviya.pk').replace(/\/$/, '')
  const waitSec = Number(arg('wait', '45'))
  const key = process.env.LINEAR_API_KEY
  if (!key) throw new Error('LINEAR_API_KEY is not set')

  let failures = await check(base)
  if (failures.length) {
    console.log(`first check failed: ${failures.join('; ')}; retrying in ${waitSec}s`)
    await new Promise((r) => setTimeout(r, waitSec * 1000))
    failures = await check(base)
  }
  const down = failures.length === probePaths.length
  const now = new Date().toISOString()
  const incident = await findIncident(key)
  const plan = decide({ down, incident })
  const isProd = base === 'https://zaviya.pk'

  if (plan.action === 'create') {
    const title = `${TITLE_PREFIX}${isProd ? '' : ' TEST'} ${base.replace(/^https?:\/\//, '')} is not answering`
    const issue = await createIncident(
      key,
      title,
      `${DOWN} ${now}\n\nOur off-server check (GitHub Actions) got no good answer from ${base} twice in a row, ${waitSec}s apart:\n${failures.map((f) => `- ${f}`).join('\n')}\n\nThe server itself may be off (the watchdog and agents live on the same VPS). Check \`ssh zaviya2 'uptime; docker ps'\` and the Contabo panel.${isProd ? '' : '\n\nThis was a test run against a non-production URL: close it.'}\n\n${MARK}`,
    )
    console.log(`incident opened: ${issue.identifier} ${issue.url}`)
  } else if (plan.action === 'comment-down') {
    await addComment(key, incident.id, `${DOWN} ${now}\n\nDown again:\n${failures.map((f) => `- ${f}`).join('\n')}\n\n${MARK}`)
    console.log(`commented on ${incident.identifier}: down again`)
  } else if (plan.action === 'comment-up') {
    const mins = minutesBetween(plan.since, now)
    await addComment(key, incident.id, `${UP} ${now}\n\nBack up. Down for about ${mins} min (first failed check at ${plan.since}; checks run every 5 min). Close this issue once the cause is explained.\n\n${MARK}`)
    console.log(`commented on ${incident.identifier}: recovered after ${mins} min`)
  } else {
    console.log(down ? `still down, ${incident?.identifier} already tracks it` : failures.length ? `one probe failed (${failures.join('; ')}) but the site answers: no incident` : 'ok')
  }
  // A red run makes GitHub email whoever owns the schedule, independent of Linear
  if (down) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(2)
  })
}
