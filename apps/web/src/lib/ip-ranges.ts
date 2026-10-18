import { META_RANGES } from './meta-ranges'

/** CIDR membership for IPv4 and IPv6, with no dependencies. */
interface Range {
  v6: boolean
  start: bigint
  end: bigint
}

function v4(ip: string): bigint | null {
  const p = ip.split('.')
  if (p.length !== 4) return null
  let n = 0n
  for (const s of p) {
    const x = Number(s)
    if (!/^\d{1,3}$/.test(s) || x > 255) return null
    n = (n << 8n) | BigInt(x)
  }
  return n
}

function v6(ip: string): bigint | null {
  let s = ip.toLowerCase()
  // IPv4-mapped tail (::ffff:1.2.3.4)
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s)
  if (tail) {
    const n = v4(tail[1]!)
    if (n === null) return null
    s = s.slice(0, -tail[1]!.length) + `${(n >> 16n).toString(16)}:${(n & 0xffffn).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0
  const groups = [...head, ...Array(Math.max(0, fill)).fill('0'), ...rest]
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null
  return groups.reduce((n, g) => (n << 16n) | BigInt(parseInt(g, 16)), 0n)
}

export function parseCidr(cidr: string): Range | null {
  const [addr, bitsRaw] = cidr.split('/')
  const isV6 = addr!.includes(':')
  const n = isV6 ? v6(addr!) : v4(addr!)
  const width = isV6 ? 128n : 32n
  const bits = BigInt(bitsRaw ?? (isV6 ? 128 : 32))
  if (n === null || bits < 0n || bits > width) return null
  const host = (1n << (width - bits)) - 1n
  return { v6: isV6, start: n & ~host, end: (n & ~host) | host }
}

export function ipInRanges(ip: string, ranges: Range[]): boolean {
  const isV6 = ip.includes(':')
  const n = isV6 ? v6(ip) : v4(ip)
  if (n === null) return false
  return ranges.some((r) => r.v6 === isV6 && n >= r.start && n <= r.end)
}

let meta: Range[] | null = null
/** True for an address in Meta's own network: their link checkers and preview browsers, not people. */
export function isMetaIp(ip: string | null | undefined): boolean {
  if (!ip) return false
  meta ??= META_RANGES.map(parseCidr).filter((r): r is Range => r !== null)
  return ipInRanges(ip.trim(), meta)
}
