import { zodToJsonSchema } from 'zod-to-json-schema'
import type { z } from 'zod'
import type { LLMProvider, Msg, ToolDef } from './types.js'

export interface ToolLoopResult<T> {
  content: string
  parsed: T
  messages: Msg[]
  steps: number
}

export async function runToolLoop<T>(
  provider: LLMProvider,
  opts: {
    model: string
    messages: Msg[]
    tools: ToolDef[]
    outputSchema: z.ZodType<T>
    format?: Record<string, unknown>
    temperature?: number
    maxTokens?: number
    signal?: AbortSignal
    maxSteps?: number
  },
): Promise<ToolLoopResult<T>> {
  const maxSteps = opts.maxSteps ?? 6
  const jsonSchema = zodToJsonSchema(opts.outputSchema, { target: 'openApi3' }) as Record<string, unknown>
  const format = opts.format ?? jsonSchema

  const messages: Msg[] = [...opts.messages]
  let lastContent = ''

  for (let step = 0; step < maxSteps; step++) {
    const result = await provider.chat({
      model: opts.model,
      messages,
      tools: opts.tools,
      format: step === maxSteps - 1 ? format : undefined,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      signal: opts.signal,
    })
    lastContent = result.content

    if (result.toolCalls.length === 0) {
      const parsed = await parseWithRepair(provider, {
        model: opts.model,
        content: lastContent,
        schema: opts.outputSchema,
        format,
        signal: opts.signal,
      })
      return { content: lastContent, parsed, messages, steps: step + 1 }
    }

    messages.push({
      role: 'assistant',
      content: result.content,
      toolCalls: result.toolCalls,
      interactionId: result.interactionId,
    })

    for (const tc of result.toolCalls) {
      const tool = opts.tools.find((t) => t.name === tc.name)
      let output: unknown
      try {
        if (!tool) {
          output = { error: `Unknown tool: ${tc.name}` }
        } else {
          output = await tool.handler(tc.arguments)
        }
      } catch (e) {
        output = { error: e instanceof Error ? e.message : String(e) }
      }
      messages.push({
        role: 'tool',
        toolCallId: tc.id,
        content: typeof output === 'string' ? output : JSON.stringify(output),
      })
    }
  }

  const parsed = await parseWithRepair(provider, {
    model: opts.model,
    content: lastContent,
    schema: opts.outputSchema,
    format,
    signal: opts.signal,
  })
  return { content: lastContent, parsed, messages, steps: maxSteps }
}

async function parseWithRepair<T>(
  provider: LLMProvider,
  opts: {
    model: string
    content: string
    schema: z.ZodType<T>
    format: Record<string, unknown>
    signal?: AbortSignal
  },
): Promise<T> {
  const tryParse = (text: string): T => {
    const trimmed = extractJson(text)
    const obj = JSON.parse(trimmed) as unknown
    return opts.schema.parse(obj)
  }

  try {
    return tryParse(opts.content)
  } catch (firstErr) {
    const repairMessages: Msg[] = [
      {
        role: 'system',
        content:
          'Fix the JSON so it validates against the schema. Return ONLY valid JSON, no markdown.',
      },
      {
        role: 'user',
        content: `Invalid output:\n${opts.content}\n\nError: ${firstErr instanceof Error ? firstErr.message : String(firstErr)}`,
      },
    ]
    const repaired = await provider.chat({
      model: opts.model,
      messages: repairMessages,
      format: opts.format,
      temperature: 0,
      signal: opts.signal,
    })
    return tryParse(repaired.content)
  }
}

function extractJson(text: string): string {
  const t = text.trim()
  if (t.startsWith('{') || t.startsWith('[')) return t
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)
  if (fence?.[1]) return fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) return t.slice(start, end + 1)
  return t
}
