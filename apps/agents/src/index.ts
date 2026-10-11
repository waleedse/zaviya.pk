import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { Engines, type EngineName } from './engines.js'
import { SCHEDULE, TIMEOUT_MIN, isDue, slotKey, type AgentName } from './schedule.js'
import { CONFIRM_CHECKS, DEFAULT_CONFIRM_CHECKS, findProblems, type Observation, type Problem } from './watchdog.js'

/**
 * Server-side agents runner: the watchdog every minute (plain code) and the Editor-in-Chief on its
 * schedule (LLM). The build-side agents (PM, engineer, SEO, social) run on Waleed's Mac instead.
 *   AGENT_DATA  persistent volume: journals, shared notes, state
 *   WORKSPACE   read-only copy of the playbook, role files and the Linear script (from the image)
 *   --once editor | --once watchdog   single run (manual test)
 */
const run = promisify(execFile)
const DATA = process.env.AGENT_DATA ?? '/data'
const WORKSPACE = process.env.WORKSPACE ?? '/app'
const SITE_URL = process.env.SITE_URL ?? 'https://zaviya.pk'
const PAYLOAD_URL = process.env.PAYLOAD_URL ?? 'http://web:3000'
const API_KEY = process.env.PAYLOAD_API_KEY ?? ''
const engines = new Engines(DATA)

function log(agent: string, msg: string) {
  const line = `${new Date().toISOString()} [${agent}] ${msg}`
  console.log(line)
  const dir = path.join(DATA, agent)
  fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(path.join(dir, 'runs.log'), `${line}\n`)
}

function readState<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, 'state', name), 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeState(name: string, value: unknown) {
  fs.mkdirSync(path.join(DATA, 'state'), { recursive: true })
  fs.writeFileSync(path.join(DATA, 'state', name), JSON.stringify(value, null, 1))
}

async function linear(...args: string[]): Promise<{ id?: string } | null> {
  try {
    const { stdout } = await run('node', [path.join(WORKSPACE, 'ops/bin/linear.mjs'), ...args], { env: process.env })
    return JSON.parse(stdout) as { id?: string }
  } catch (e) {
    log('watchdog', `linear ${args[0]} failed: ${(e as Error).message.slice(0, 300)}`)
    return null
  }
}

// ---------- watchdog ----------

async function observe(): Promise<Observation> {
  const now = Date.now()
  const siteStatus = await fetch(SITE_URL, { signal: AbortSignal.timeout(15_000), redirect: 'manual' })
    .then((r) => r.status)
    .catch(() => 0)
  const headers = { Authorization: `users API-Key ${API_KEY}` }
  const settings = (await fetch(`${PAYLOAD_URL}/api/globals/settings?depth=0`, { headers, signal: AbortSignal.timeout(15_000) })
    .then((r) => r.json())
    .catch(() => ({}))) as { lastHeartbeat?: string; lastHeartbeatMeta?: { queues?: Observation['heartbeat']['queues']; integrations?: { extension?: boolean } } }
  const latest = (await fetch(`${PAYLOAD_URL}/api/articles?limit=1&sort=-publishedAt&depth=0&where[_status][equals]=published`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  })
    .then((r) => r.json())
    .catch(() => ({}))) as { docs?: { publishedAt?: string }[] }
  const publishedAt = latest.docs?.[0]?.publishedAt
  return {
    now,
    siteStatus,
    heartbeat: {
      at: settings.lastHeartbeat ? Date.parse(settings.lastHeartbeat) : null,
      queues: settings.lastHeartbeatMeta?.queues ?? {},
      extension: settings.lastHeartbeatMeta?.integrations?.extension ?? null,
    },
    lastPublishedAt: publishedAt ? Date.parse(publishedAt) : null,
  }
}

interface Tracked {
  count: number
  issue?: string
  lastNote?: number
  problem: Problem
}

let previous: Observation | undefined

async function watchdog() {
  const obs = await observe()
  const problems = findProblems(obs, previous)
  previous = obs
  const tracked = readState<Record<string, Tracked>>('watchdog.json', {})
  const seen = new Set(problems.map((p) => p.key))

  for (const p of problems) {
    const t: Tracked = tracked[p.key] ?? { count: 0, problem: p }
    t.count++
    t.problem = p
    const confirmAfter = CONFIRM_CHECKS[p.key] ?? DEFAULT_CONFIRM_CHECKS
    if (t.count >= confirmAfter && !t.issue) {
      const body = [
        p.detail,
        '',
        p.label === 'needs-waleed'
          ? '@Waleed need your input: this one needs you (see above). Everything else keeps running.'
          : 'Opened by the watchdog. Engineer: diagnose with `ssh zaviya` (docker logs, releases/history.log), fix, and comment here.',
        `First seen: ${new Date(obs.now - (t.count - 1) * 60_000).toISOString()}`,
      ].join('\n')
      const issue = await linear('create', '--title', `[watchdog] ${p.title}`, '--body', body, '--label', p.label, '--priority', p.key === 'site-down' ? '1' : '2')
      if (issue?.id) {
        t.issue = issue.id
        t.lastNote = obs.now
        log('watchdog', `opened ${issue.id}: ${p.title}`)
      }
    } else if (t.issue && obs.now - (t.lastNote ?? 0) > 60 * 60_000) {
      await linear('comment', t.issue, '--body', `Still happening (${t.count} checks): ${p.detail}`)
      t.lastNote = obs.now
    }
    tracked[p.key] = t
  }

  for (const [key, t] of Object.entries(tracked)) {
    if (seen.has(key)) continue
    if (t.issue) {
      await linear('comment', t.issue, '--body', `Recovered at ${new Date(obs.now).toISOString()} (watchdog no longer sees it).`)
      log('watchdog', `recovered ${t.issue}: ${t.problem.title}`)
    }
    delete tracked[key]
  }
  writeState('watchdog.json', tracked)
}

// ---------- editor ----------

function readRole(agent: AgentName): { model: string; body: string } {
  const raw = fs.readFileSync(path.join(WORKSPACE, '.claude', 'agents', `${agent}.md`), 'utf8')
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/)
  return { model: fm?.[1]?.match(/^model:\s*(\S+)/m)?.[1] ?? 'haiku', body: fm ? raw.slice(fm[0].length) : raw }
}

const EDITOR_TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'WebSearch',
  'WebFetch',
  `Write(${DATA}/**)`,
  `Edit(${DATA}/**)`,
  'Bash(curl:*)',
  'Bash(node ops/bin/linear.mjs:*)',
  'Bash(date:*)',
]

async function runAgent(agent: AgentName, session: string) {
  const home = path.join(DATA, agent)
  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(path.join(DATA, 'shared'), { recursive: true })
  const journal = path.join(home, 'journal.md')
  if (!fs.existsSync(journal)) fs.writeFileSync(journal, `# ${agent} journal\n`)
  const role = readRole(agent)
  const prompt = [
    `Session: ${session}. Time: ${new Date().toISOString()} (Pakistan is UTC+5).`,
    `Site: ${SITE_URL}. Payload API: ${PAYLOAD_URL}/api (header "Authorization: users API-Key $PAYLOAD_API_KEY").`,
    `Your journal: ${journal}. Shared notes: ${path.join(DATA, 'shared')}.`,
    "Start by reading ops/agents/PLAYBOOK.md and your journal. Do this session's work, then append a dated journal entry.",
    'Finish with a 3-line summary of what you did.',
  ].join('\n')
  const order = (process.env.EDITOR_ENGINES ?? 'cursor,claude').split(',').map((s) => s.trim()) as EngineName[]
  log(agent, `start ${session}`)
  const res = await engines.run({
    order,
    role: role.body,
    prompt,
    claudeModel: role.model,
    allowedTools: EDITOR_TOOLS,
    cwd: WORKSPACE,
    timeoutMin: TIMEOUT_MIN[agent],
    log: (s) => log(agent, s),
  })
  log(agent, `${res.ok ? 'done' : 'FAILED'} via ${res.engine}: ${res.output.trim().split('\n').slice(-3).join(' | ').slice(0, 600)}`)
}

// ---------- loop ----------

let agentBusy = false

async function tick() {
  await watchdog().catch((e) => log('watchdog', `error: ${(e as Error).message}`))
  if (agentBusy) return
  const now = new Date()
  const runs = readState<Record<string, number>>('last-runs.json', {})
  for (const agent of Object.keys(SCHEDULE) as AgentName[]) {
    for (const slot of SCHEDULE[agent]) {
      const key = slotKey(agent, slot)
      if (!isDue(slot, now, runs[key] ?? 0)) continue
      writeState('last-runs.json', { ...runs, [key]: Date.now() })
      agentBusy = true
      // Agent runs take minutes; the watchdog keeps ticking meanwhile.
      void runAgent(agent, slot.session)
        .catch((e) => log(agent, `run error: ${(e as Error).message}`))
        .finally(() => (agentBusy = false))
      return
    }
  }
}

async function main() {
  fs.mkdirSync(DATA, { recursive: true })
  const once = process.argv.indexOf('--once')
  if (once >= 0) {
    const what = process.argv[once + 1]
    if (what === 'watchdog') {
      const obs = await observe()
      console.log(JSON.stringify({ obs, problems: findProblems(obs) }, null, 1))
    } else {
      await runAgent('editor', process.argv[once + 2] ?? 'hourly')
    }
    return
  }
  console.log(`agents runner up; editor engines: ${process.env.EDITOR_ENGINES ?? 'cursor,claude'}`)
  await tick()
  setInterval(() => void tick(), 60_000)
}

void main()
