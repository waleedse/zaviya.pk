#!/usr/bin/env node
// Payload API for the Zaviya agents, without the key in the command line. Claude Code refuses Bash
// commands that expand $PAYLOAD_API_KEY, so the editor could not run the gate (15 Oct: 99 stories waiting).
//   payload.mjs GET /api/pipeline/gate
//   payload.mjs POST /api/pipeline/gate/123 '{"action":"publish"}'
//   payload.mjs PATCH /api/articles/123?locale=en '{"title":"..."}'
// Prints the response body (JSON when it is JSON); exits 1 on HTTP errors.
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

const [method = '', path = '', body] = process.argv.slice(2)
if (!/^(GET|POST|PATCH|PUT|DELETE)$/i.test(method) || !path.startsWith('/')) {
  console.error('usage: payload.mjs <GET|POST|PATCH|PUT|DELETE> /api/... [json-body]')
  process.exit(2)
}
const base = (process.env.PAYLOAD_URL || fromFile('PAYLOAD_URL') || 'http://web:3000').replace(/\/$/, '')
const key = process.env.PAYLOAD_API_KEY || fromFile('PAYLOAD_API_KEY')
if (!key) {
  console.error('PAYLOAD_API_KEY is not set')
  process.exit(1)
}
if (body !== undefined) {
  try {
    JSON.parse(body)
  } catch {
    console.error('body is not valid JSON')
    process.exit(2)
  }
}
const res = await fetch(base + path, {
  method: method.toUpperCase(),
  headers: { Authorization: `users API-Key ${key}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
  body,
  signal: AbortSignal.timeout(60_000),
})
const text = await res.text()
console.log(text)
if (!res.ok) {
  console.error(`HTTP ${res.status}`)
  process.exit(1)
}
