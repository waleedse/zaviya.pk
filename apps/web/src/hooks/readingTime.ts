function countWordsInLexical(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  const state = value as { root?: { children?: unknown[] } }
  const children = state.root?.children ?? []
  let text = ''
  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue
      const n = node as Record<string, unknown>
      if (n.type === 'text' && typeof n.text === 'string') text += `${n.text} `
      if (Array.isArray(n.children)) walk(n.children)
    }
  }
  walk(children)
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length
}

export function computeReadingTimeMinutes(body: unknown): number {
  const words = countWordsInLexical(body)
  return Math.max(1, Math.ceil(words / 200))
}
