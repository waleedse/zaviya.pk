import type { TrafficSource } from './analytics'

/**
 * ZAV-290: when Zaviya posts a link, Meta opens it in a real browser from several addresses at once. Part of those
 * come from AS32934 (caught by the IP list in ip-ranges.ts); the rest come from other networks, run JavaScript and
 * report a normal browser agent, country US, referrer www.facebook.com / m.facebook.com. They always arrive as a
 * burst of 3-8 hits on one path within 1-3 s, which no organic Pakistani audience does.
 */
export const BURST_WINDOW_MS = 5_000
export const BURST_MIN_HITS = 3
/** How long a suspect hit waits so the rest of its burst has arrived before it is judged. */
export const BURST_SETTLE_MS = 2_000

const MAX_PATHS = 500

export interface BurstTracker {
  /** Remember a suspect hit on this path. */
  note(path: string, at?: number): void
  /** Suspect hits on this path within the window ending at `at`. */
  count(path: string, at?: number): number
  /** True when the path has had at least BURST_MIN_HITS suspect hits within the window. */
  isBurst(path: string, at?: number): boolean
}

export function createBurstTracker(windowMs = BURST_WINDOW_MS, minHits = BURST_MIN_HITS): BurstTracker {
  const hits = new Map<string, number[]>()
  const recent = (path: string, at: number) => (hits.get(path) ?? []).filter((t) => at - t <= windowMs && t - at <= windowMs)
  return {
    note(path, at = Date.now()) {
      const list = (hits.get(path) ?? []).filter((t) => at - t <= windowMs)
      list.push(at)
      hits.set(path, list)
      if (hits.size > MAX_PATHS) {
        for (const [p, ts] of hits) if (!ts.some((t) => at - t <= windowMs)) hits.delete(p)
      }
    },
    count: (path, at = Date.now()) => recent(path, at).length,
    isBurst: (path, at = Date.now()) => recent(path, at).length >= minHits,
  }
}

/** How long after a Meta drop on a path a lone facebook+US follower is still treated as another Meta fetcher. */
export const DROP_MEMORY_MS = 60_000

export interface DropTracker {
  /** Remember that a Meta hit (meta-ip or meta-preview) was dropped on this path. */
  note(path: string, at?: number): void
  /** True when a Meta drop happened on this path within the memory window ending at `at`. */
  hasRecent(path: string, at?: number): boolean
}

/**
 * ZAV-290 follow-up: a burst sometimes leaves exactly one non-Meta-IP follower that never reaches the burst threshold
 * (the Meta-IP hits are dropped early and the follower arrives seconds to ~30 s later). A facebook+US hit on a path
 * where we just dropped a Meta hit is that follower, not a reader.
 */
export function createDropTracker(memoryMs = DROP_MEMORY_MS): DropTracker {
  const last = new Map<string, number>()
  return {
    note(path, at = Date.now()) {
      last.set(path, Math.max(at, last.get(path) ?? 0))
      if (last.size > MAX_PATHS) {
        for (const [p, t] of last) if (at - t > memoryMs) last.delete(p)
      }
    },
    hasRecent(path, at = Date.now()) {
      const t = last.get(path)
      return t !== undefined && at - t <= memoryMs && t - at <= memoryMs
    },
  }
}

/** A hit that could be a Meta preview browser: it claims to come from Facebook and from the US (real readers are PK). */
export function isMetaPreviewCandidate(source: TrafficSource, country: string | null | undefined): boolean {
  return source === 'facebook' && country?.toUpperCase() === 'US'
}

/** Coarse network prefix (/24 or /48) for the log line, so new Meta networks can be added to the IP list; never the full address. */
export function ipPrefix(ip: string): string {
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::/48'
  const p = ip.split('.')
  return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.0/24` : '?'
}

export const metaBursts = createBurstTracker()

export const metaDrops = createDropTracker()
