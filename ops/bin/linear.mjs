#!/usr/bin/env node
// Tiny Linear CLI for the Zaviya agents (LINEAR_API_KEY, team ZAV).
//   linear.mjs list [--label engineer] [--state "Todo"] [--limit 20]
//   linear.mjs get ZAV-12
//   linear.mjs create --title "..." --body "..." [--label engineer --label needs-waleed] [--priority 2]
//   linear.mjs comment ZAV-12 --body "..."
//   linear.mjs update ZAV-12 [--state "In Progress"] [--add-label pm-approved] [--remove-label needs-waleed]
// Output is JSON so agents can read it back.

const API = 'https://api.linear.app/graphql'
const TEAM_KEY = process.env.LINEAR_TEAM_KEY ?? 'ZAV'
const KEY = process.env.LINEAR_API_KEY
if (!KEY) fail('LINEAR_API_KEY is not set')

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) {
      out._.push(a)
      continue
    }
    const k = a.slice(2)
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
    out[k] = out[k] === undefined ? v : [].concat(out[k], v)
  }
  return out
}

const list = (v) => (v === undefined ? [] : [].concat(v))

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: KEY },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) fail(JSON.stringify(json.errors))
  return json.data
}

let teamCache
async function team() {
  if (teamCache) return teamCache
  const d = await gql(
    `query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id
      states { nodes { id name type } }
      labels(first: 250) { nodes { id name } } } } }`,
    { key: TEAM_KEY },
  )
  teamCache = d.teams.nodes[0]
  if (!teamCache) fail(`team ${TEAM_KEY} not found`)
  return teamCache
}

async function labelIds(names) {
  const t = await team()
  return names.map((n) => {
    const l = t.labels.nodes.find((x) => x.name.toLowerCase() === n.toLowerCase())
    if (!l) fail(`unknown label "${n}" (have: ${t.labels.nodes.map((x) => x.name).join(', ')})`)
    return l.id
  })
}

async function stateId(name) {
  const t = await team()
  const s = t.states.nodes.find((x) => x.name.toLowerCase() === name.toLowerCase() || x.type === name)
  if (!s) fail(`unknown state "${name}" (have: ${t.states.nodes.map((x) => x.name).join(', ')})`)
  return s.id
}

const ISSUE_FIELDS = `id identifier title url priority updatedAt
  state { name } labels { nodes { name } } assignee { name }`

function flat(i) {
  return {
    id: i.identifier,
    title: i.title,
    state: i.state?.name,
    labels: i.labels?.nodes.map((l) => l.name) ?? [],
    priority: i.priority,
    updatedAt: i.updatedAt,
    url: i.url,
    ...(i.description !== undefined ? { description: i.description } : {}),
    ...(i.comments ? { comments: i.comments.nodes.map((c) => ({ at: c.createdAt, by: c.user?.name ?? 'app', body: c.body })) } : {}),
  }
}

const args = parseArgs(process.argv.slice(2))
const [cmd, id] = args._

if (cmd === 'list') {
  const filter = { team: { key: { eq: TEAM_KEY } } }
  const labels = list(args.label)
  if (labels.length) filter.labels = { some: { name: { in: labels } } }
  if (args.state) filter.state = { name: { eqIgnoreCase: args.state } }
  else filter.state = { type: { nin: ['completed', 'canceled'] } }
  const d = await gql(
    `query($filter: IssueFilter, $first: Int) { issues(filter: $filter, first: $first, orderBy: updatedAt) { nodes { ${ISSUE_FIELDS} } } }`,
    { filter, first: Number(args.limit ?? 30) },
  )
  console.log(JSON.stringify(d.issues.nodes.map(flat), null, 1))
} else if (cmd === 'get') {
  const d = await gql(
    `query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} description
      comments(first: 50) { nodes { body createdAt user { name } } } } }`,
    { id },
  )
  console.log(JSON.stringify(flat(d.issue), null, 1))
} else if (cmd === 'create') {
  if (!args.title) fail('--title is required')
  const t = await team()
  const input = { teamId: t.id, title: args.title, description: args.body ?? '' }
  const labels = list(args.label)
  if (labels.length) input.labelIds = await labelIds(labels)
  if (args.priority) input.priority = Number(args.priority)
  if (args.state) input.stateId = await stateId(args.state)
  const d = await gql(`mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { ${ISSUE_FIELDS} } } }`, { input })
  console.log(JSON.stringify(flat(d.issueCreate.issue), null, 1))
} else if (cmd === 'comment') {
  if (!id || !args.body) fail('usage: comment ZAV-1 --body "..."')
  const issue = (await gql(`query($id: String!) { issue(id: $id) { id } }`, { id })).issue
  await gql(`mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`, {
    input: { issueId: issue.id, body: args.body },
  })
  console.log(JSON.stringify({ ok: true, id }))
} else if (cmd === 'update') {
  if (!id) fail('usage: update ZAV-1 [--state ...] [--add-label ...] [--remove-label ...]')
  const input = {}
  if (args.state) input.stateId = await stateId(args.state)
  if (args.title) input.title = args.title
  if (args.priority) input.priority = Number(args.priority)
  if (list(args['add-label']).length) input.addedLabelIds = await labelIds(list(args['add-label']))
  if (list(args['remove-label']).length) input.removedLabelIds = await labelIds(list(args['remove-label']))
  const d = await gql(`mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { issue { ${ISSUE_FIELDS} } } }`, {
    id,
    input,
  })
  console.log(JSON.stringify(flat(d.issueUpdate.issue), null, 1))
} else {
  fail('commands: list | get | create | comment | update')
}
