export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.floor(Math.random() * (Math.max(maxMs - minMs, 0) + 1))
  return new Promise((r) => setTimeout(r, ms))
}
