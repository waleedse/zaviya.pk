/**
 * Self-healing guard for the web process (ZAV-169).
 *
 * On 22 Oct the Node heap filled up (about 2 GB, `JavaScript heap out of memory`, three times in 6 hours). Before
 * the final crash the process spent up to 80 minutes in garbage-collection thrash: the cached homepage still
 * answered, but every Payload call (the agents, the worker, the admin) hung, and nginx returned 504s. Docker
 * only restarts a container once the process exits, and the healthcheck (robots.txt) never noticed.
 *
 * This guard makes the process exit early and cleanly (Docker restarts it in about 2 s) when it is clearly sick:
 *   1. heap: used heap above HEAP_RATIO of the limit on HEAP_STRIKES checks in a row
 *   2. API: a Payload read (the settings global, the same path the agents use) fails or takes over PROBE_TIMEOUT_MS
 *      on PROBE_STRIKES probes in a row
 * Kill switch: HEAP_GUARD=off. Never acts in the first GRACE_MS after boot, so a restart loop is impossible.
 */
export const HEAP_RATIO = 0.85
export const HEAP_STRIKES = 8
export const HEAP_CHECK_MS = 15_000
export const PROBE_INTERVAL_MS = 60_000
export const PROBE_TIMEOUT_MS = 20_000
export const PROBE_STRIKES = 3
export const GRACE_MS = 5 * 60_000

export interface GuardState {
  heapStrikes: number
  probeStrikes: number
}

export const freshState = (): GuardState => ({ heapStrikes: 0, probeStrikes: 0 })

/** One heap sample. Returns the new state and a reason to exit, or null. */
export function checkHeap(state: GuardState, usedBytes: number, limitBytes: number, uptimeMs: number): { state: GuardState; exit: string | null } {
  const ratio = limitBytes > 0 ? usedBytes / limitBytes : 0
  const strikes = ratio > HEAP_RATIO ? state.heapStrikes + 1 : 0
  const exit =
    strikes >= HEAP_STRIKES && uptimeMs > GRACE_MS
      ? `heap at ${Math.round(ratio * 100)}% of the limit on ${strikes} checks in a row (${Math.round(usedBytes / 1048576)} MB used)`
      : null
  return { state: { ...state, heapStrikes: strikes }, exit }
}

/** One API probe result (ok = the read finished within the timeout). */
export function checkProbe(state: GuardState, ok: boolean, uptimeMs: number): { state: GuardState; exit: string | null } {
  const strikes = ok ? 0 : state.probeStrikes + 1
  const exit = strikes >= PROBE_STRIKES && uptimeMs > GRACE_MS ? `Payload read failed or timed out on ${strikes} probes in a row` : null
  return { state: { ...state, probeStrikes: strikes }, exit }
}

export function guardEnabled(env: { HEAP_GUARD?: string | undefined } = process.env as { HEAP_GUARD?: string }): boolean {
  return (env.HEAP_GUARD ?? '').toLowerCase() !== 'off'
}

/** Starts the timers. Called once from instrumentation.ts in the Node runtime. */
export async function startHeapGuard(): Promise<void> {
  if (!guardEnabled()) return
  const { getHeapStatistics } = await import('node:v8')
  const bootedAt = Date.now()
  let state = freshState()
  const die = (reason: string) => {
    console.error(`[heap-guard] ${reason}: exiting so Docker restarts the web process`)
    process.exit(1)
  }

  setInterval(() => {
    const h = getHeapStatistics()
    const r = checkHeap(state, h.used_heap_size, h.heap_size_limit, Date.now() - bootedAt)
    state = r.state
    if (r.exit) die(r.exit)
  }, HEAP_CHECK_MS).unref()

  let probing = false
  setInterval(() => {
    if (probing) {
      // The previous probe has not even returned after a whole interval: count it as a failure
      const r = checkProbe(state, false, Date.now() - bootedAt)
      state = r.state
      if (r.exit) die(r.exit)
      return
    }
    probing = true
    const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), PROBE_TIMEOUT_MS).unref())
    const read = import('./payload')
      .then(({ getPayloadClient }) => getPayloadClient())
      .then((p) => p.findGlobal({ slug: 'settings', depth: 0, overrideAccess: true }))
      .then(() => true as const)
      .catch(() => false as const)
    void Promise.race([read, timeout]).then((ok) => {
      if (ok) probing = false
      else void read.finally(() => (probing = false))
      const r = checkProbe(state, ok, Date.now() - bootedAt)
      state = r.state
      if (r.exit) die(r.exit)
    })
  }, PROBE_INTERVAL_MS).unref()
}
