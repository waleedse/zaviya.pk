import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ChatResult, JSONSchema, LLMProvider, Msg } from './types.js'

/**
 * Subscription-backed coding CLIs used as plain text engines:
 *   cursor  → `cursor-agent -p` (CURSOR_API_KEY, Cursor plan)
 *   claude  → `claude -p`       (CLAUDE_CODE_OAUTH_TOKEN, Claude plan)
 * Each call runs in an empty temp directory so the agent has nothing to read or edit.
 * When a plan's limit is hit the provider cools down until the reset time (or a default
 * window) and throws RateLimited, so the router moves on to the next engine.
 */
export type CliKind = 'cursor' | 'claude'

/** The plan behind a CLI is out of quota (or resting): try the next engine. */
export class CliRateLimited extends Error {
  override name = 'CliRateLimited'
}

export interface CliProviderOptions {
  kind: CliKind
  /** Binary path; defaults to `cursor-agent` / `claude` on PATH */
  bin?: string
  /** Extra environment (tokens) for the child process */
  env?: Record<string, string | undefined>
  /** Max calls per rolling 5 hours (keeps a slice of the plan free for the agents); 0 = unlimited */
  maxCallsPer5h?: number
  /** Cool-down when the plan reports a limit without a reset time */
  cooldownMs?: number
}

const FIVE_HOURS = 5 * 60 * 60_000
const LIMIT_PATTERN = /usage limit|rate limit|limit reached|quota|too many requests|429|out of (?:fast )?requests|resets? (?:at|in)/i

export class CliProvider implements LLMProvider {
  readonly id: string
  private readonly bin: string
  private coolUntil = 0
  private calls: number[] = []

  constructor(private readonly opts: CliProviderOptions) {
    this.id = opts.kind
    this.bin = opts.bin ?? (opts.kind === 'cursor' ? 'cursor-agent' : 'claude')
  }

  /** True while the plan is resting after a limit, or when the local 5h budget is spent. */
  isResting(now = Date.now()): boolean {
    this.calls = this.calls.filter((t) => now - t < FIVE_HOURS)
    const max = this.opts.maxCallsPer5h ?? 0
    return now < this.coolUntil || (max > 0 && this.calls.length >= max)
  }

  status(): { kind: CliKind; restingUntil: number | null; callsLast5h: number } {
    const resting = this.isResting()
    return { kind: this.opts.kind, restingUntil: resting ? Math.max(this.coolUntil, Date.now()) : null, callsLast5h: this.calls.length }
  }

  async health(): Promise<boolean> {
    return !this.isResting()
  }

  async embed(): Promise<number[][]> {
    throw new Error(`${this.id} cannot embed`)
  }

  async chat(opts: {
    model: string
    messages: Msg[]
    format?: JSONSchema
    signal?: AbortSignal
  }): Promise<ChatResult> {
    if (this.isResting()) throw new CliRateLimited(`${this.id} resting`)
    const system = opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
    const convo = opts.messages
      .filter((m) => m.role !== 'system')
      .map((m) => (m.role === 'user' ? m.content : `[${m.role}]\n${m.content}`))
      .join('\n\n')
    const jsonRule = opts.format
      ? `\n\nRespond with ONLY one JSON object (no prose, no code fences) matching this JSON Schema:\n${JSON.stringify(opts.format)}`
      : ''
    const prompt = `${this.opts.kind === 'cursor' && system ? `${system}\n\n` : ''}${convo}${jsonRule}\n\nDo not use any tools or read any files: answer from the text above only.`

    const args =
      this.opts.kind === 'cursor'
        ? ['-p', '--trust', '--output-format', 'json', ...(opts.model ? ['--model', opts.model] : [])]
        : [
            '-p',
            '--output-format', 'json',
            '--max-turns', '1',
            '--model', opts.model || 'haiku',
            '--disallowedTools', 'Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit',
            ...(system ? ['--system-prompt', system] : []),
          ]

    this.calls.push(Date.now())
    const { stdout, stderr, code } = await this.run(args, prompt, opts.signal)
    const parsed = parseCliJson(stdout)
    const text = parsed?.result ?? ''
    const failed = code !== 0 || !parsed || parsed.is_error === true || !text.trim()
    if (failed) {
      const detail = `${text} ${stderr}`.slice(0, 400)
      if (LIMIT_PATTERN.test(detail)) {
        this.coolUntil = parseResetAt(detail) ?? Date.now() + (this.opts.cooldownMs ?? 60 * 60_000)
        throw new CliRateLimited(`${this.id} limit: ${detail}`)
      }
      throw new Error(`${this.id} failed (exit ${code}): ${detail}`)
    }
    return {
      content: opts.format ? extractJson(text) : text.trim(),
      toolCalls: [],
      model: `${this.id}:${opts.model || 'default'}`,
      provider: this.id,
      usage: parsed.usage
        ? {
            promptTokens: parsed.usage.input_tokens ?? parsed.usage.inputTokens,
            completionTokens: parsed.usage.output_tokens ?? parsed.usage.outputTokens,
          }
        : undefined,
    }
  }

  private async run(args: string[], input: string, signal?: AbortSignal): Promise<{ stdout: string; stderr: string; code: number }> {
    const cwd = await mkdtemp(path.join(tmpdir(), `${this.id}-`))
    try {
      return await new Promise((resolve, reject) => {
        // cursor-agent takes the prompt as an argument; claude reads it from stdin.
        const finalArgs = this.opts.kind === 'cursor' ? [...args, input] : args
        const child = spawn(this.bin, finalArgs, {
          cwd,
          env: { ...process.env, ...this.opts.env, CI: '1' },
          stdio: ['pipe', 'pipe', 'pipe'],
          signal,
        })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (d) => (stdout += d))
        child.stderr.on('data', (d) => (stderr += d))
        child.on('error', reject)
        child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 1 }))
        if (this.opts.kind === 'claude') child.stdin.end(input)
        else child.stdin.end()
      })
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  }
}

interface CliJson {
  result?: string
  is_error?: boolean
  usage?: { input_tokens?: number; output_tokens?: number; inputTokens?: number; outputTokens?: number }
}

/** Both CLIs print one JSON object (`{"type":"result","result":...}`); tolerate log lines around it. */
export function parseCliJson(stdout: string): CliJson | null {
  const lines = stdout.trim().split('\n').reverse()
  for (const line of lines) {
    const t = line.trim()
    if (!t.startsWith('{')) continue
    try {
      const obj = JSON.parse(t) as CliJson & { type?: string }
      if (obj.type === 'result' || 'result' in obj) return obj
    } catch {
      /* not JSON */
    }
  }
  try {
    return JSON.parse(stdout) as CliJson
  } catch {
    return null
  }
}

/** Pull the JSON object out of a reply that may be wrapped in code fences or prose. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced?.[1] ?? text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  return start >= 0 && end > start ? body.slice(start, end + 1) : body
}

/** "…limit reached|1791740000" or "resets at 2026-10-11T20:00:00Z" → epoch ms */
export function parseResetAt(detail: string): number | null {
  const epoch = detail.match(/\|(\d{10})\b/)
  if (epoch) return Number(epoch[1]) * 1000
  const iso = detail.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z)/)
  if (iso) {
    const t = Date.parse(iso[1]!)
    if (!Number.isNaN(t)) return t
  }
  return null
}
