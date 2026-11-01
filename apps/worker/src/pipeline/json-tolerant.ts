import { extractJson } from '@zaviya/llm'

/**
 * Parse model output as JSON, tolerating prose before/after the object, code fences and a second object
 * (ZAV-210: "Unexpected non-whitespace character after JSON at position 7488" lost an approved Jobs story).
 * Takes the first balanced top-level object, respecting strings and escapes.
 */
export function parseModelJson(text: string): unknown {
  try {
    return JSON.parse(extractJson(text))
  } catch (first) {
    const body = text.replace(/```(?:json)?/gi, '')
    const start = body.indexOf('{')
    if (start < 0) throw first
    let depth = 0
    let inStr = false
    let esc = false
    for (let i = start; i < body.length; i++) {
      const c = body[i]!
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
      } else if (c === '"') inStr = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) return JSON.parse(body.slice(start, i + 1))
    }
    throw first
  }
}

export class EmptyModelReplyError extends Error {
  constructor(public readonly task: string, public readonly model?: string) {
    super(`${task}: model returned an empty reply`)
    this.name = 'EmptyModelReplyError'
  }
}

/**
 * Ask a model for JSON and parse the reply. An empty or unparseable reply is retried once (ZAV-280: "Unexpected end of JSON input"
 * silently skipped QA/SEO); a second failure throws a labelled error ("empty reply" vs "bad JSON") instead of a bare SyntaxError.
 */
export async function chatJson(
  ask: () => Promise<{ content: string; model?: string }>,
  task: string,
  onRetry?: (info: { task: string; reason: 'empty' | 'bad_json'; model?: string }) => void,
): Promise<unknown> {
  let last: Error | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ask()
    if (!res.content || !res.content.trim()) {
      last = new EmptyModelReplyError(task, res.model)
      onRetry?.({ task, reason: 'empty', model: res.model })
      continue
    }
    try {
      return parseModelJson(res.content)
    } catch (e) {
      last = new Error(`${task}: model reply is not valid JSON (${e instanceof Error ? e.message : String(e)}; ${res.content.length} chars)`)
      onRetry?.({ task, reason: 'bad_json', model: res.model })
    }
  }
  throw last
}
