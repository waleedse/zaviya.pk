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
