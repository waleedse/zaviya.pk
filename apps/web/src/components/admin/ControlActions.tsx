'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import styles from './ControlRoom.module.css'

async function send(body: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText)
}

function useAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const run = (body: Record<string, unknown>, done: string) =>
    start(async () => {
      try {
        await send(body)
        setMsg(done)
        router.refresh()
      } catch (e) {
        setMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
  return { pending, msg, run }
}

export function ReviewActions({ reviewId, clusterId }: { reviewId: string; clusterId: string }) {
  const { pending, msg, run } = useAction()
  if (msg && !msg.startsWith('Failed')) return <span className={styles.muted}>{msg}</span>
  return (
    <span className={styles.actions}>
      <button className={styles.btnPrimary} disabled={pending} onClick={() => run({ action: 'approve', reviewId, clusterId }, 'Approved, writing…')}>
        Approve
      </button>
      <button className={styles.btn} disabled={pending} onClick={() => run({ action: 'reject', reviewId, clusterId }, 'Rejected')}>
        Reject
      </button>
      {msg ? <small className={styles.down}>{msg}</small> : null}
    </span>
  )
}

export function ControlActions({ killSwitch, paused, pending: queued }: { killSwitch: boolean; paused: boolean; pending: number }) {
  const { pending, msg, run } = useAction()
  return (
    <div className={styles.controls}>
      <button className={styles.btn} disabled={pending} onClick={() => run({ action: 'ingest' }, 'Fetching all sources now')}>
        Fetch news now
      </button>
      <button className={styles.btn} disabled={pending} onClick={() => run({ action: 'discover' }, 'Checking X / Instagram')}>
        Check X / Instagram
      </button>
      {paused ? (
        <button className={styles.btn} disabled={pending} onClick={() => run({ action: 'resume' }, 'Resuming')}>
          Resume
        </button>
      ) : (
        <button className={styles.btn} disabled={pending} onClick={() => run({ action: 'pause' }, 'Pausing')}>
          Pause
        </button>
      )}
      <button
        className={killSwitch ? styles.btnPrimary : styles.btnDanger}
        disabled={pending}
        onClick={() => {
          if (killSwitch || confirm('Stop ALL automation (writing, publishing, social) until you turn it back on?')) {
            run({ action: 'kill', on: !killSwitch }, killSwitch ? 'Automation re-enabled' : 'Kill switch on')
          }
        }}
      >
        {killSwitch ? 'Turn automation back on' : 'Kill switch'}
      </button>
      <span className={styles.muted}>
        {msg ?? (queued ? `${queued} command(s) waiting for the worker` : 'Commands reach the worker within ~20s.')}
      </span>
    </div>
  )
}

export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(t)
  }, [router, seconds])
  return null
}
