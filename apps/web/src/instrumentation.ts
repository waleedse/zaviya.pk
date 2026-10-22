/** Next.js calls this once when the server process starts (ZAV-169: self-healing guard, see lib/heap-guard.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const { startHeapGuard } = await import('./lib/heap-guard')
  await startHeapGuard()
}
