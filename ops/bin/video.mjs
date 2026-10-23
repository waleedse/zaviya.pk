#!/usr/bin/env node
// The explainer-video backlog, for the editor agent (the key stays out of the command line, like payload.mjs).
//   video.mjs ideas                                  ranked backlog: id, title, score, risk, decision, hours left, sources
//   video.mjs add '{"title":"...","angle":"...","sources":["https://..."],"tags":["AI"],"hours":24}'
//   video.mjs decide <id> <boost|ok|veto> [note]     boost = make it soon; ok = allowed (needed for needs-veto ideas); veto = never
//   video.mjs run [--dry] [--now] [ideaId]           make one now (--dry: make and preview, never post)
// Talks to the media hub of the video service (http://video:8790 inside the compose network).
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'

function fromFile(name) {
  for (const file of [process.env.ZAVIYA_AGENT_ENV, `${homedir()}/.zaviya-agents/.env`, '/data/.env'].filter(Boolean)) {
    if (!existsSync(file)) continue
    const m = readFileSync(file, 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}

const [cmd = '', ...args] = process.argv.slice(2)
const base = (process.env.VIDEO_HUB_URL || fromFile('VIDEO_HUB_URL') || 'http://video:8790').replace(/\/$/, '')
const token = process.env.MEDIA_AGENT_TOKEN || fromFile('MEDIA_AGENT_TOKEN')
if (!token) {
  console.error('MEDIA_AGENT_TOKEN is not set')
  process.exit(1)
}

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${text}`)
    process.exit(1)
  }
  return text ? JSON.parse(text) : {}
}

if (cmd === 'ideas') {
  const ideas = await call('GET', '/ideas')
  for (const i of ideas) {
    console.log(`${i.id}  score ${i.score}  ${i.risk}${i.decision ? `  [${i.decision}]` : ''}${i.hoursLeft !== null ? `  ${i.hoursLeft}h left` : '  evergreen'}  ${i.title}`)
    if (i.sources?.length) console.log(`        ${i.sources.join(' ')}`)
  }
} else if (cmd === 'add') {
  console.log(JSON.stringify(await call('POST', '/ideas', JSON.parse(args[0] ?? '{}'))))
} else if (cmd === 'decide') {
  const [id, decision, ...note] = args
  console.log(JSON.stringify(await call('POST', `/ideas/${id}`, { decision, note: note.join(' ') || undefined })))
} else if (cmd === 'run') {
  const ideaId = args.find((a) => !a.startsWith('--'))
  console.log(JSON.stringify(await call('POST', '/explainer/run', { dry: args.includes('--dry'), now: args.includes('--now'), ...(ideaId ? { ideaId } : {}) })))
} else {
  console.error('usage: video.mjs ideas | add <json> | decide <id> <boost|ok|veto> [note] | run [--dry] [--now] [ideaId]')
  process.exit(2)
}
