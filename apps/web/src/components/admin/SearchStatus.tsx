import type { Payload } from 'payload'
import { searchStatus } from '@/lib/search/status'
import styles from './ControlRoom.module.css'

const fmt = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('en-US') : '–')
function ago(v: unknown): string {
  if (!v) return 'never'
  const s = Math.max(0, (Date.now() - new Date(String(v)).getTime()) / 1000)
  if (s < 60) return `${Math.round(s)}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
const cell = { padding: '4px 10px', textAlign: 'left' as const, borderBottom: '1px solid var(--theme-elevation-150, #e4e2da)', fontSize: 13 }

/** Product search sync status in the admin dashboard (docs/PRODUCT-SEARCH.md section 6) */
export async function SearchStatus({ payload }: { payload: Payload }) {
  let d: Awaited<ReturnType<typeof searchStatus>>
  try {
    d = await searchStatus(payload)
  } catch (e) {
    return <div className={styles.room}><h2 className={styles.title}>Product search</h2><p className={styles.muted}>Could not load: {e instanceof Error ? e.message : String(e)}</p></div>
  }
  const m = d.meili as { healthy?: boolean; dbBytes?: number; docs?: number; indexing?: boolean; error?: string }
  const o = (d.offers ?? {}) as Record<string, any>
  const h = (d.hosts ?? {}) as Record<string, any>
  const s = (d.sync ?? {}) as Record<string, any>
  return (
    <div className={styles.room}>
      <h2 className={styles.title}>Product search</h2>
      <p>
        Meilisearch: <b style={{ color: m.healthy ? '#12805c' : '#c0392b' }}>{m.healthy ? 'healthy' : `DOWN ${m.error ?? ''}`}</b> · index {m.dbBytes ? `${(m.dbBytes / 1e6).toFixed(0)} MB` : '–'} · {fmt(m.docs)} products indexed{m.indexing ? ' (indexing…)' : ''} · last sync {ago(s.last_sync_at)}
        {s.last_error ? <span style={{ color: '#c0392b' }}> · error: {String(s.last_error).slice(0, 120)}</span> : null}
      </p>
      <p>
        Listings {fmt(o.offers)} · synced in 24 h {fmt(o.synced_24h)} · waiting for sync {fmt(o.pending)} · price changes 24 h {fmt(o.price_changes_24h)} · new 24 h {fmt(o.new_24h)}
      </p>
      <p>
        Stores: {fmt(h.active)} active · {fmt(h.queue)} waiting to be probed · {fmt(h.rejected)} rejected · {fmt(h.paused)} paused · {fmt(h.new_24h)} found in 24 h · categories (store labels) {fmt((d.labels as any)?.total)} ({fmt((d.labels as any)?.new_24h)} new 24 h)
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>{['Store', 'Type', 'State', 'Listings', 'Last crawl', 'Next', 'Price changes 24 h', 'Failures', 'Last error'].map((t) => <th key={t} style={cell}>{t}</th>)}</tr>
        </thead>
        <tbody>
          {d.stores.slice(0, 60).map((r: any) => (
            <tr key={r.host}>
              <td style={cell}>{r.name} <span style={{ opacity: 0.55 }}>{r.host}</span></td>
              <td style={cell}>{r.platform ?? '–'}</td>
              <td style={cell}>{r.state}</td>
              <td style={cell}>{fmt(r.offers)}</td>
              <td style={cell}>{ago(r.last_crawl_at)}</td>
              <td style={cell}>{r.next_crawl_at ? new Date(r.next_crawl_at).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '–'}</td>
              <td style={cell}>{fmt(r.price_changes_24h)}</td>
              <td style={cell}>{r.fail_count || ''}</td>
              <td style={cell}>{r.last_error ? String(r.last_error).slice(0, 60) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 style={{ marginTop: 16 }}>Discovery reports (every 6 h)</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>{['When', 'New stores', 'Activated', 'Rejected', 'New products', 'New categories', 'Uncategorised', 'New category examples'].map((t) => <th key={t} style={cell}>{t}</th>)}</tr>
        </thead>
        <tbody>
          {d.reports.map((r: any) => (
            <tr key={String(r.at)}>
              <td style={cell}>{ago(r.at)}</td>
              <td style={cell}>{fmt(r.stats?.new_hosts)}</td>
              <td style={cell}>{fmt(r.stats?.activated_6h)}</td>
              <td style={cell}>{fmt(r.stats?.rejected_6h)}</td>
              <td style={cell}>{fmt(r.stats?.new_products)}</td>
              <td style={cell}>{fmt(r.stats?.new_labels)}</td>
              <td style={cell}>{fmt(r.stats?.uncategorised)}</td>
              <td style={cell}>{(r.stats?.newLabels ?? []).slice(0, 4).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
