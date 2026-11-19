import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * LLM engines for agent runs. No permission bypass: Claude only gets the tools in `allowedTools`;
 * Cursor runs in a scratch workspace that holds the playbook and the Linear script, with no git
 * credentials. An engine that hits its plan limit rests until reset (state in $AGENT_DATA/state).
 */
export type EngineName = 'claude' | 'cursor'

export interface EngineRun {
  engine: EngineName
  ok: boolean
  output: string
}

// 19 Nov: the Claude CLI says "You've hit your weekly limit · resets 7am (UTC)", which the old pattern missed, so the claude
// engine never rested and failed every 30-minute editor cycle from 08:08 to 11:38 PKT.
export const LIMIT_PATTERN = /usage limit|rate limit|limit reached|quota|too many requests|\b429\b|out of (?:fast )?requests|you['\u2019]ve hit your [a-z ]{0,15}limit/i

export class Engines {
  private readonly stateFile: string

  constructor(dataDir: string) {
    this.stateFile = path.join(dataDir, 'state', 'engines.json')
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true })
  }

  private rest(): Record<string, number> {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) as Record<string, number>
    } catch {
      return {}
    }
  }

  restingUntil(engine: EngineName): number {
    const until = this.rest()[engine] ?? 0
    return until > Date.now() ? until : 0
  }

  available(order: EngineName[]): EngineName[] {
    return order.filter((e) => {
      if (e === 'claude' && !process.env.CLAUDE_CODE_OAUTH_TOKEN) return false
      if (e === 'cursor' && !process.env.CURSOR_API_KEY) return false
      return !this.restingUntil(e)
    })
  }

  async run(opts: {
    order: EngineName[]
    role: string
    prompt: string
    claudeModel: string
    allowedTools: string[]
    cwd: string
    timeoutMin: number
    log: (s: string) => void
  }): Promise<EngineRun> {
    let last: EngineRun = { engine: opts.order[0] ?? 'claude', ok: false, output: 'no engine available (missing keys or all resting)' }
    for (const engine of this.available(opts.order)) {
      const run = await this.runOne(engine, opts)
      if (run.ok) return run
      last = run
      if (LIMIT_PATTERN.test(run.output.slice(-2000))) {
        const until = parseReset(run.output) ?? Date.now() + 60 * 60_000
        fs.writeFileSync(this.stateFile, JSON.stringify({ ...this.rest(), [engine]: until }, null, 1))
        opts.log(`${engine} hit its plan limit; resting until ${new Date(until).toISOString()}`)
      } else {
        opts.log(`${engine} failed: ${run.output.slice(-400)}`)
      }
    }
    return last
  }

  private runOne(
    engine: EngineName,
    opts: { role: string; prompt: string; claudeModel: string; allowedTools: string[]; cwd: string; timeoutMin: number },
  ): Promise<EngineRun> {
    const [cmd, args, stdin] =
      engine === 'claude'
        ? ([
            'claude',
            [
              '-p',
              '--model', opts.claudeModel,
              '--max-turns', '60',
              '--output-format', 'text',
              '--allowedTools', opts.allowedTools.join(','),
              '--append-system-prompt', opts.role,
            ],
            opts.prompt,
          ] as const)
        : ([
            'cursor-agent',
            ['-p', '--force', '--output-format', 'text', '--model', process.env.CURSOR_AGENT_MODEL ?? 'auto', `${opts.role}\n\n---\n\n${opts.prompt}`],
            '',
          ] as const)
    return new Promise((resolve) => {
      const child = spawn(cmd, [...args], {
        cwd: opts.cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: AbortSignal.timeout(opts.timeoutMin * 60_000),
      })
      let out = ''
      child.stdout.on('data', (d) => (out += d))
      child.stderr.on('data', (d) => (out += d))
      child.on('error', (e) => resolve({ engine, ok: false, output: `${out}\n${e.message}` }))
      child.on('close', (code) => resolve({ engine, ok: code === 0 && !LIMIT_PATTERN.test(out.slice(-300)), output: out }))
      child.stdin.end(stdin)
    })
  }
}

export function parseReset(text: string, now = Date.now()): number | null {
  const epoch = text.match(/\|(\d{10})\b/)
  if (epoch) return Number(epoch[1]) * 1000
  // "resets 7am (UTC)" / "resets 7:30pm (UTC)": the next time that clock reads
  const clock = text.match(/resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\((?:UTC|GMT)\)/i)
  if (clock) {
    let h = Number(clock[1]) % 12
    if (clock[3]!.toLowerCase() === 'pm') h += 12
    const d = new Date(now)
    d.setUTCHours(h, Number(clock[2] ?? 0), 0, 0)
    if (d.getTime() <= now) d.setUTCDate(d.getUTCDate() + 1)
    return d.getTime()
  }
  const iso = text.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z)/)
  return iso ? Date.parse(iso[1]!) || null : null
}
