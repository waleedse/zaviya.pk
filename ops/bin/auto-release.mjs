#!/usr/bin/env node
// Merge and release agent PRs that the PM approved. Run by .github/workflows/auto-release.yml.
// A PR qualifies when: head branch agent/*, title starts with a Linear id (ZAV-12: ...), that issue has
// `pm-approved` and not `risk-high`, every check passed and GitHub says it is mergeable.
// Then: squash-merge, tag vYYYY.MM.DD-N (PKT date), and dispatch the zero-downtime Deploy workflow.
import { execFileSync } from 'node:child_process'

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim()
const KEY = process.env.LINEAR_API_KEY
if (!KEY) throw new Error('LINEAR_API_KEY secret missing')

async function linearLabels(identifier) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: KEY },
    body: JSON.stringify({ query: 'query($id:String!){ issue(id:$id){ identifier labels { nodes { name } } } }', variables: { id: identifier } }),
  })
  const json = await res.json()
  return json.data?.issue?.labels.nodes.map((l) => l.name) ?? null
}

async function comment(identifier, body) {
  const issue = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: KEY },
    body: JSON.stringify({ query: 'query($id:String!){ issue(id:$id){ id } }', variables: { id: identifier } }),
  }).then((r) => r.json())
  const issueId = issue.data?.issue?.id
  if (!issueId) return
  await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: KEY },
    body: JSON.stringify({ query: 'mutation($i:CommentCreateInput!){ commentCreate(input:$i){ success } }', variables: { i: { issueId, body: `${body}\n\n— 🤖 Auto release` } } }),
  })
}

function nextTag() {
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10).replaceAll('-', '.')
  const tags = gh('api', 'repos/{owner}/{repo}/tags?per_page=100', '--jq', '.[].name').split('\n')
  const n = Math.max(0, ...tags.filter((t) => t.startsWith(`v${today}-`)).map((t) => Number(t.split('-').pop()) || 0))
  return `v${today}-${n + 1}`
}

const prs = JSON.parse(gh('pr', 'list', '--state', 'open', '--json', 'number,title,headRefName,mergeable,statusCheckRollup', '--limit', '30'))
for (const pr of prs) {
  if (!pr.headRefName.startsWith('agent/')) continue
  const id = pr.title.match(/^(ZAV-\d+)/)?.[1]
  if (!id) continue
  const labels = await linearLabels(id)
  if (!labels?.includes('pm-approved') || labels.includes('risk-high')) {
    console.log(`#${pr.number} ${id}: waiting for PM approval (labels: ${labels?.join(', ') ?? 'issue not found'})`)
    continue
  }
  const checks = pr.statusCheckRollup ?? []
  const pending = checks.some((c) => (c.status ?? 'COMPLETED') !== 'COMPLETED')
  const failed = checks.some((c) => c.conclusion && !['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(c.conclusion))
  if (!checks.length || pending || failed || pr.mergeable !== 'MERGEABLE') {
    console.log(`#${pr.number} ${id}: not ready (checks=${checks.length} pending=${pending} failed=${failed} mergeable=${pr.mergeable})`)
    continue
  }
  gh('pr', 'merge', String(pr.number), '--squash', '--delete-branch')
  const tag = nextTag()
  gh('release', 'create', tag, '--target', 'main', '--title', tag, '--notes', `${pr.title} (#${pr.number}), approved by the PM in Linear ${id}.`)
  // Releases made with GITHUB_TOKEN do not trigger workflows; dispatch the deploy explicitly.
  gh('workflow', 'run', 'deploy.yml', '-f', `ref=${tag}`)
  await comment(id, `Merged #${pr.number} and released ${tag}. Zero-downtime deploy started.`)
  console.log(`#${pr.number} ${id}: merged, released ${tag}`)
}
