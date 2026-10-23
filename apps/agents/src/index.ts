import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { statfs } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { Engines, type EngineName } from './engines.js'
import { SCHEDULE, TIMEOUT_MIN, isDue, slotKey, type AgentName } from './schedule.js'
import { fetchCommentsSince, inboxPrompt, newHumanComments } from './inbox.js'
import { findProblems, planWatchdog, type Observation, type WatchdogState } from './watchdog.js'

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

async function linear(...args: string[]): Promise<{ id?: string; state?: string } | null> {
  try {
    const { stdout } = await run('node', [path.join(WORKSPACE, 'ops/bin/linear.mjs'), ...args], { env: process.env })
    return JSON.parse(stdout) as { id?: string; state?: string }
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
  // This authenticated call doubles as the API probe: a hang or error means apiOk = false, not "worker silent"
  type SettingsDoc = { lastHeartbeat?: string; lastHeartbeatMeta?: { queues?: Observation['heartbeat']['queues']; integrations?: { extension?: boolean } } }
  let apiOk = true
  const settings = await fetch(`${PAYLOAD_URL}/api/globals/settings?depth=0`, { headers, signal: AbortSignal.timeout(15_000) })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<SettingsDoc>
    })
    .catch(() => {
      apiOk = false
      return {} as SettingsDoc
    })
  const latest = (await fetch(`${PAYLOAD_URL}/api/articles?limit=1&sort=-publishedAt&depth=0&where[_status][equals]=published`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  })
    .then((r) => r.json())
    .catch(() => ({}))) as { docs?: { publishedAt?: string }[] }
  const publishedAt = latest.docs?.[0]?.publishedAt
  // Container overlay shares the host root disk, so this is the server's disk
  const disk = await statfs('/').catch(() => null)
  return {
    now,
    diskUsedPct: disk ? (1 - disk.bavail / disk.blocks) * 100 : null,
    siteStatus,
    apiOk,
    heartbeat: {
      at: settings.lastHeartbeat ? Date.parse(settings.lastHeartbeat) : null,
      queues: settings.lastHeartbeatMeta?.queues ?? {},
      extension: settings.lastHeartbeatMeta?.integrations?.extension ?? null,
    },
    lastPublishedAt: publishedAt ? Date.parse(publishedAt) : null,
  }
}

let previous: Observation | undefined

/** An open (not Done/Canceled) incident with exactly this title, so a lost state file never makes a second issue. */
async function findOpenIssue(title: string): Promise<string | undefined> {
  try {
    const { stdout } = await run('node', [path.join(WORKSPACE, 'ops/bin/linear.mjs'), 'list', '--label', 'incident', '--limit', '100'], { env: process.env })
    return (JSON.parse(stdout) as { id: string; title: string }[]).find((i) => i.title === title)?.id
  } catch {
    return undefined
  }
}

async function watchdog() {
  const obs = await observe()
  const problems = findProblems(obs, previous)
  previous = obs
  const prev: WatchdogState = readState<WatchdogState>('watchdog2.json', { tracked: readState('watchdog.json', {}), resolved: {} })
  const { actions, state } = planWatchdog(prev, problems, obs.now)

  for (const a of actions) {
    const t = state.tracked[a.key]
    const title = `[watchdog] ${a.problem.title}`
    if (a.type === 'open') {
      const body = [
        a.problem.detail,
        '',
        a.problem.label === 'needs-waleed'
          ? '@Waleed need your input: this one needs you (see above). Everything else keeps running.'
          : 'Opened by the watchdog. Engineer: diagnose with `ssh zaviya` (docker logs, releases/history.log), fix, and comment here.',
        'One issue per outage: if it comes back within 12 h the watchdog comments here instead of opening another.',
        `First seen: ${new Date(a.firstSeen).toISOString()}`,
      ].join('\n')
      const existing = await findOpenIssue(title)
      if (existing) {
        if (t) t.issue = existing
        await linear('comment', existing, '--body', `Seen again at ${new Date(obs.now).toISOString()}: ${a.problem.detail}`)
        log('watchdog', `reused ${existing}: ${a.problem.title}`)
        continue
      }
      const issue = await linear('create', '--title', title, '--body', body, '--label', a.problem.label, '--priority', a.key === 'site-down' || a.key === 'api-hung' ? '1' : '2')
      if (issue?.id) {
        if (t) t.issue = issue.id
        log('watchdog', `opened ${issue.id}: ${a.problem.title}`)
      } else if (t) {
        t.count = 0 // creation failed: count again so the next confirmed check retries
      }
    } else if (a.type === 'reopen') {
      const cur = await linear('get', a.issue)
      if (!cur?.state || /^(done|canceled|cancelled|duplicate)$/i.test(cur.state)) await linear('update', a.issue, '--state', 'Todo')
      await linear('comment', a.issue, '--body', `Back at ${new Date(obs.now).toISOString()}: ${a.problem.detail}`)
      log('watchdog', `reopened ${a.issue}: ${a.problem.title}`)
    } else if (a.type === 'note') {
      await linear('comment', a.issue, '--body', `Still happening (${a.count} checks): ${a.problem.detail}`)
    } else {
      await linear('comment', a.issue, '--body', `Recovered at ${new Date(obs.now).toISOString()} (watchdog no longer sees it).`)
      log('watchdog', `recovered ${a.issue}: ${a.problem.title}`)
    }
  }
  writeState('watchdog2.json', state)
}

// ---------- editor ----------

function readRole(agent: string): { model: string; body: string } {
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
  'Bash(node ops/bin/payload.mjs:*)',
  'Bash(node ops/bin/video.mjs:*)',
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
    `Site: ${SITE_URL}. Payload API: ${PAYLOAD_URL}/api through "node ops/bin/payload.mjs <METHOD> /api/... [json]" (it adds the key; never put $PAYLOAD_API_KEY in a command, the shell refuses it).`,
    `Your journal: ${journal}. Shared notes: ${path.join(DATA, 'shared')}.`,
    session === 'quick'
      ? 'QUICK RUN (keep it under 6 minutes): first the pitches from your role (approve the strongest for writing, reject weak ones), then the publishing gate (publish the strongest waiting draft, reject weak ones), then check only the articles published since your last journal entry. For each: headline states the news (no outlet name), facts match the sources, it is real reporting and not a write-up of another outlet\'s headline, category and image fit. Fix it, or set `_status: draft` if it is thin or wrong, and note it. Do not do the hourly tasks. Append one short journal line.'
      : "Start by reading ops/agents/PLAYBOOK.md and your journal. Do this session's work, then append a dated journal entry.",
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

// ---------- inbox: Waleed's Linear comments wake the PM ----------

const INBOX_EVERY_MS = 2 * 60_000
let inboxBusy = false
let lastInboxCheck = 0

async function inbox() {
  const key = process.env.LINEAR_API_KEY
  if (!key || inboxBusy || Date.now() - lastInboxCheck < INBOX_EVERY_MS) return
  lastInboxCheck = Date.now()
  // First run starts from now: older comments were already handled by hand.
  const state = readState<{ since: string; seen: string[] }>('inbox.json', { since: new Date().toISOString(), seen: [] })
  const comments = await fetchCommentsSince(state.since, key)
  const todo = newHumanComments(comments, new Set(state.seen)).slice(0, 3)
  if (!todo.length) {
    writeState('inbox.json', state)
    return
  }
  inboxBusy = true
  try {
    for (const c of todo) {
      log('inbox', `${c.issue!.identifier}: answering "${c.body.slice(0, 80).replace(/\n/g, ' ')}"`)
      const role = readRole('product')
      const res = await engines.run({
        order: (process.env.EDITOR_ENGINES ?? 'cursor,claude').split(',').map((x) => x.trim()) as EngineName[],
        role: role.body,
        prompt: [
          `Time: ${new Date().toISOString()} (Pakistan is UTC+5). Site: ${SITE_URL}. Payload API: ${PAYLOAD_URL}/api through "node ops/bin/payload.mjs <METHOD> /api/... [json]" (it adds the key; never put $PAYLOAD_API_KEY in a command, the shell refuses it).`,
          'Read ops/agents/PLAYBOOK.md first.',
          inboxPrompt(c),
        ].join('\n'),
        claudeModel: role.model,
        allowedTools: EDITOR_TOOLS,
        cwd: WORKSPACE,
        timeoutMin: 15,
        log: (m) => log('inbox', m),
      })
      log('inbox', `${res.ok ? 'replied' : 'FAILED'} on ${c.issue!.identifier} via ${res.engine}: ${res.output.trim().split('\n').slice(-1)[0]?.slice(0, 300) ?? ''}`)
      state.seen = [...state.seen, c.id].slice(-200)
      state.since = c.createdAt
      writeState('inbox.json', state)
    }
  } finally {
    inboxBusy = false
  }
}

// ---------- loop ----------

let agentBusy = false

async function tick() {
  await watchdog().catch((e) => log('watchdog', `error: ${(e as Error).message}`))
  // The inbox runs beside the editor so Waleed never waits for an hourly run to finish
  void inbox().catch((e) => log('inbox', `error: ${(e as Error).message}`))
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
      const agent: AgentName = what === 'research' ? 'research' : 'editor'
      await runAgent(agent, process.argv[once + 2] ?? SCHEDULE[agent][0]!.session)
    }
    return
  }
  console.log(`agents runner up; editor engines: ${process.env.EDITOR_ENGINES ?? 'cursor,claude'}`)
  await tick()
  setInterval(() => void tick(), 60_000)
}

void main()
