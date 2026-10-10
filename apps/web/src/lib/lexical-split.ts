const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'quote',
  'list',
  'upload',
  'horizontalrule',
])

type LexicalNode = {
  type?: string
  children?: LexicalNode[]
  [key: string]: unknown
}

type LexicalDoc = {
  root?: LexicalNode
}

function isBlockNode(node: LexicalNode): boolean {
  return Boolean(node.type && BLOCK_TYPES.has(node.type))
}

/** Split lexical rich text after the Nth block-level node (1-based breakpoints). */
export function splitLexicalAtBreakpoints(
  data: unknown,
  breakpoints: number[],
): { segments: unknown[]; adAfterSegment: boolean[] } {
  if (!data || typeof data !== 'object') {
    return { segments: [data], adAfterSegment: [false] }
  }
  const doc = data as LexicalDoc
  const root = doc.root
  if (!root?.children?.length) {
    return { segments: [data], adAfterSegment: [false] }
  }

  const children = root.children
  const blockChildIndices: number[] = []
  children.forEach((child, idx) => {
    if (isBlockNode(child)) blockChildIndices.push(idx)
  })

  if (blockChildIndices.length === 0) {
    return { segments: [data], adAfterSegment: [false] }
  }

  const cutAfterChildIndex = new Set<number>()
  for (const bp of breakpoints) {
    if (bp > 0 && bp <= blockChildIndices.length) {
      cutAfterChildIndex.add(blockChildIndices[bp - 1]!)
    }
  }

  if (cutAfterChildIndex.size === 0) {
    return { segments: [data], adAfterSegment: [false] }
  }

  const segments: unknown[] = []
  const adAfterSegment: boolean[] = []
  let start = 0
  for (let i = 0; i < children.length; i++) {
    if (cutAfterChildIndex.has(i)) {
      segments.push(sliceLexical(doc, start, i + 1))
      adAfterSegment.push(true)
      start = i + 1
    }
  }
  if (start < children.length) {
    segments.push(sliceLexical(doc, start, children.length))
    adAfterSegment.push(false)
  } else if (segments.length === 0) {
    segments.push(data)
    adAfterSegment.push(false)
  }

  return { segments, adAfterSegment }
}

function sliceLexical(doc: LexicalDoc, start: number, end: number): unknown {
  const root = doc.root!
  return {
    ...doc,
    root: {
      ...root,
      children: root.children!.slice(start, end),
    },
  }
}
