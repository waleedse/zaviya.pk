import type { Payload } from 'payload'
import { loadControlRoom, type ControlRoomData } from '@/lib/control-room'
import { ControlActions, ReviewActions, AutoRefresh } from './ControlActions'
import styles from './ControlRoom.module.css'

const SOURCE_LABELS: Record<string, string> = {
  google: 'Google Search',
  discover: 'Google Discover',
  'google-news': 'Google News',
  bing: 'Bing / other search',
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  x: 'X (Twitter)',
  youtube: 'YouTube',
  push: 'Push notifications',
  direct: 'Direct / typed',
  other: 'Other sites',
}

const fmt = (n: number) => n.toLocaleString('en-US')

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${Math.round(s)}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

function delta(now: number, before: number) {
  if (!before) return now ? <span className={styles.up}>new</span> : null
  const pct = Math.round(((now - before) / before) * 100)
  return <span className={pct >= 0 ? styles.up : styles.down}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}%</span>
}

function Pill({ ok, label, hint }: { ok: boolean | undefined; label: string; hint?: string }) {
  return (
    <span className={`${styles.pill} ${ok ? styles.pillOk : styles.pillBad}`} title={hint}>
      <span className={styles.dot} />
      {label}
    </span>
  )
}

function TrafficChart({ daily }: { daily: ControlRoomData['traffic']['daily'] }) {
  const max = Math.max(1, ...daily.map((d) => d.pageviews))
  const w = 640
  const h = 160
  const bw = w / daily.length
  return (
    <svg viewBox={`0 0 ${w} ${h + 22}`} className={styles.chart} role="img" aria-label="Pageviews over the last 14 days">
      {daily.map((d, i) => {
        const ph = (d.pageviews / max) * h
        const sh = (d.search / max) * h
        const x = i * bw + 4
        return (
          <g key={d.day}>
            <title>{`${d.day}: ${d.pageviews} pageviews, ${d.visitors} visitors, ${d.search} from search`}</title>
            <rect x={x} y={h - ph} width={bw - 8} height={Math.max(ph, d.pageviews ? 2 : 0)} rx={4} className={styles.barAll} />
            <rect x={x} y={h - sh} width={bw - 8} height={sh} rx={4} className={styles.barSearch} />
            <text x={x + (bw - 8) / 2} y={h + 16} textAnchor="middle" className={styles.axis}>
              {d.day.slice(8)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function Bars({ rows, labels }: { rows: { key: string; value: number }[]; labels?: Record<string, string> }) {
  const total = rows.reduce((a, r) => a + r.value, 0) || 1
  if (!rows.length) return <p className={styles.muted}>No data yet.</p>
  return (
    <ul className={styles.bars}>
      {rows.map((r) => (
        <li key={r.key}>
          <span className={styles.barLabel}>{labels?.[r.key] ?? r.key}</span>
          <span className={styles.barTrack}>
            <span className={styles.barFill} style={{ width: `${(r.value / total) * 100}%` }} />
          </span>
          <span className={styles.barValue}>
            {fmt(r.value)} <small>{Math.round((r.value / total) * 100)}%</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

export async function ControlRoom({ payload }: { payload: Payload }) {
  let data: ControlRoomData
  try {
    data = await loadControlRoom(payload)
  } catch (e) {
    return (
      <div className={styles.room}>
        <h2 className={styles.title}>Control Room</h2>
        <p className={styles.muted}>Could not load stats: {e instanceof Error ? e.message : String(e)}</p>
      </div>
    )
  }
  const { traffic, content, pipeline, worker, learning } = data
  const coolingModels = Object.keys(worker.geminiCooldowns)
  const searchStarted = Boolean(traffic.firstSearchVisit)
  const siteBase = process.env.NEXT_PUBLIC_SITE_URL ?? ''

  return (
    <div className={styles.room}>
      <AutoRefresh seconds={30} />
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Control Room</h2>
          <p className={styles.muted}>Live view of traffic, publishing and the automation. Refreshes every 30s.</p>
        </div>
        <div className={styles.pills}>
          <Pill ok={worker.online} label={worker.online ? 'Worker online' : 'Worker offline'} hint={`Last heartbeat ${ago(worker.lastHeartbeat)}`} />
          <Pill ok={worker.integrations.gemini} label="Gemini" />
          <Pill ok={worker.integrations.extension} label="Extension" hint="Chrome extension connected (Gemini images, X/Instagram discovery)" />
          <Pill ok={worker.integrations.ollama} label="Ollama" />
          <Pill ok={!worker.killSwitch && !worker.paused} label={worker.killSwitch ? 'Kill switch ON' : worker.paused ? 'Paused' : 'Automation running'} />
        </div>
      </header>

      <section className={styles.kpis}>
        <div className={`${styles.card} ${styles.kpi} ${styles.live}`}>
          <span className={styles.kpiLabel}>
            <span className={styles.liveDot} /> On site now
          </span>
          <strong className={styles.kpiValue}>{fmt(traffic.liveVisitors)}</strong>
          <span className={styles.muted}>visitors in the last 5 min</span>
        </div>
        <div className={`${styles.card} ${styles.kpi}`}>
          <span className={styles.kpiLabel}>Today (PKT)</span>
          <strong className={styles.kpiValue}>{fmt(traffic.today.pageviews)}</strong>
          <span className={styles.muted}>
            pageviews · {fmt(traffic.today.visitors)} visitors {delta(traffic.today.pageviews, traffic.yesterday.pageviews)}
          </span>
        </div>
        <div className={`${styles.card} ${styles.kpi}`}>
          <span className={styles.kpiLabel}>Last 7 days</span>
          <strong className={styles.kpiValue}>{fmt(traffic.last7.pageviews)}</strong>
          <span className={styles.muted}>pageviews · {fmt(traffic.last7.visitors)} visitors</span>
        </div>
        <div className={`${styles.card} ${styles.kpi}`}>
          <span className={styles.kpiLabel}>Published</span>
          <strong className={styles.kpiValue}>{fmt(content.publishedToday)}</strong>
          <span className={styles.muted}>
            last 24h · {fmt(content.published7)} this week · {fmt(content.publishedTotal)} total
          </span>
        </div>
        <div className={`${styles.card} ${styles.kpi} ${searchStarted ? styles.good : styles.waiting}`}>
          <span className={styles.kpiLabel}>Has Google traffic started?</span>
          <strong className={styles.kpiValue}>{searchStarted ? 'Yes' : 'Not yet'}</strong>
          <span className={styles.muted}>
            {searchStarted
              ? `First search visit ${ago(traffic.firstSearchVisit)} · ${fmt(traffic.searchVisits7)} search visits this week`
              : 'Normal for a new domain: submit the sitemap in Search Console and keep publishing.'}
          </span>
        </div>
      </section>

      <section className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Traffic, last 14 days</h3>
            <span className={styles.legend}>
              <i className={styles.lgAll} /> all visits <i className={styles.lgSearch} /> from search
            </span>
          </div>
          <TrafficChart daily={traffic.daily} />
        </div>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Where visitors come from</h3>
            <span className={styles.muted}>last 7 days</span>
          </div>
          <Bars rows={traffic.sources7.map((s) => ({ key: s.source, value: s.pageviews }))} labels={SOURCE_LABELS} />
          <div className={styles.cardHead} style={{ marginTop: 16 }}>
            <h3>Devices</h3>
          </div>
          <Bars rows={traffic.devices7.map((s) => ({ key: s.device, value: s.pageviews }))} />
        </div>
      </section>

      <section className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Today by source</h3>
            <span className={styles.muted}>
              {fmt(traffic.today.pageviews)} views today · {fmt(traffic.yesterday.pageviews)} yesterday
            </span>
          </div>
          <Bars rows={traffic.sourcesToday.map((s) => ({ key: s.source, value: s.pageviews }))} labels={SOURCE_LABELS} />
        </div>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Social posting, last 24 hours</h3>
          </div>
          <ul className={styles.list}>
            {data.social.platforms.map((p) => (
              <li key={p.platform}>
                <b>{SOURCE_LABELS[p.platform] ?? p.platform}</b>
                <span className={styles.meta}>{p.failed ? `${p.failed} failed` : 'no failures'}</span>
                <span className={styles.count}>{fmt(p.posted)} posted</span>
              </li>
            ))}
          </ul>
          {data.social.recentFailures.length > 0 && (
            <ul className={styles.list} style={{ marginTop: 12 }}>
              {data.social.recentFailures.map((f, i) => (
                <li key={i}>
                  <span className={styles.meta}>
                    {SOURCE_LABELS[f.platform] ?? f.platform} · {ago(f.at)}
                  </span>
                  <span>{f.error}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Top pages today</h3>
          </div>
          {traffic.topPagesToday.length ? (
            <ol className={styles.list}>
              {traffic.topPagesToday.map((p) => (
                <li key={p.path}>
                  <a href={`${siteBase}${p.path}`} target="_blank" rel="noreferrer">
                    {p.title || p.path}
                  </a>
                  <span className={styles.meta}>
                    {p.sources.map((r) => `${SOURCE_LABELS[r.source] ?? r.source} ${fmt(r.pageviews)}`).join(' · ')}
                  </span>
                  <span className={styles.count}>{fmt(p.pageviews)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.muted}>No visits yet today.</p>
          )}
        </div>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Latest articles</h3>
            <a href="/admin/collections/articles" className={styles.link}>
              All articles →
            </a>
          </div>
          <ul className={styles.list}>
            {content.latest.map((a) => (
              <li key={a.id}>
                <a href={`/admin/collections/articles/${a.id}`}>{a.title}</a>
                <span className={styles.meta}>
                  {a.category} · {ago(a.publishedAt)}
                  {a.qaScore !== undefined ? ` · QA ${Math.round(a.qaScore * 100)}` : ''}
                  {a.hasImage ? '' : ' · no image'}
                  {a.model && a.model !== 'router' ? ` · ${a.model.replace(/gemini:|ollama:/g, '')}` : ''}
                </span>
                <span className={styles.count}>{fmt(a.views)} views</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Needs your decision</h3>
            <span className={styles.muted}>{pipeline.reviews.length} waiting</span>
          </div>
          {pipeline.reviews.length ? (
            <ul className={styles.list}>
              {pipeline.reviews.map((r) => (
                <li key={r.id} className={styles.review}>
                  <div>
                    <strong>{r.headline}</strong>
                    <span className={styles.meta}>
                      {r.reason} · {ago(r.createdAt)}
                    </span>
                  </div>
                  <ReviewActions reviewId={r.id} clusterId={r.clusterId} />
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Nothing to review. Sensitive stories (courts, military, religion, deaths, elections) appear here before publishing.</p>
          )}
        </div>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Automation</h3>
            <span className={styles.muted}>heartbeat {ago(worker.lastHeartbeat)}</span>
          </div>
          <div className={styles.stats}>
            <div>
              <strong>{fmt(pipeline.items24h)}</strong>
              <span>source items (24h)</span>
            </div>
            {pipeline.clusters24h.map((c) => (
              <div key={c.status}>
                <strong>{fmt(c.count)}</strong>
                <span>stories {c.status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Queue</th>
                <th>Waiting</th>
                <th>Running</th>
                <th>Failed</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(worker.queues).map(([name, c]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{c.waiting}</td>
                  <td>{c.active}</td>
                  <td className={c.failed ? styles.down : undefined}>{c.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ControlActions killSwitch={worker.killSwitch} paused={worker.paused} pending={worker.pendingCommands} />
        </div>
      </section>

      <section className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>What the system has learned</h3>
            <span className={styles.muted}>updates daily</span>
          </div>
          <p className={styles.muted} style={{ marginBottom: 8 }}>
            Category boost in triage (from reader interest, last 14 days):
          </p>
          <div className={styles.trends}>
            {Object.entries(learning.categoryWeights).map(([k, w]) => (
              <span key={k} className={styles.trend}>
                {k} <b className={w > 1 ? styles.up : w < 1 ? styles.down : undefined}>×{w}</b>
              </span>
            ))}
            {!Object.keys(learning.categoryWeights).length ? <span className={styles.muted}>Runs after the first daily cycle.</span> : null}
          </div>
          <p className={styles.muted} style={{ margin: '14px 0 8px' }}>
            Google searches bringing visitors (Search Console, last 7 days):
          </p>
          {learning.topQueries.length ? (
            <ul className={`${styles.list} ${styles.compact}`}>
              {learning.topQueries.slice(0, 8).map((qq) => (
                <li key={qq.query}>
                  <span>{qq.query}</span>
                  <span className={styles.meta}>{fmt(qq.impressions)} impressions</span>
                  <span className={styles.count}>{fmt(qq.clicks)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>
              {learning.gscConnected ? 'No search data yet.' : 'Connect Search Console (GSC_SERVICE_ACCOUNT_JSON, GSC_SITE_URL) to see real queries and auto-improve headlines.'}
            </p>
          )}
          <p className={styles.muted} style={{ marginTop: 14 }}>
            Gemini free quota:{' '}
            {coolingModels.length ? `${coolingModels.length} model(s) resting until quota resets; local model covers the gap.` : 'available.'}
          </p>
        </div>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Trending in Pakistan</h3>
            <span className={styles.muted}>Google Trends · X</span>
          </div>
          <div className={styles.trends}>
            {[...worker.trends.map((t) => ({ ...t, src: 'G' })), ...worker.xTrends.map((t) => ({ ...t, src: 'X' }))].map((t, i) => (
              <span key={`${t.src}-${t.name}-${i}`} className={styles.trend}>
                <b>{t.src}</b> {t.name}
                {t.traffic ? <small>{t.traffic}</small> : null}
              </span>
            ))}
            {!worker.trends.length && !worker.xTrends.length ? <p className={styles.muted}>Trends appear after the first poll.</p> : null}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3>Sources (24h)</h3>
            <a href="/admin/collections/sources" className={styles.link}>
              Manage →
            </a>
          </div>
          <ul className={`${styles.list} ${styles.compact}`}>
            {pipeline.sources.map((s) => (
              <li key={s.name}>
                <span>{s.name}</span>
                <span className={styles.meta}>polled {ago(s.lastPolledAt)}</span>
                <span className={s.items24h ? styles.count : `${styles.count} ${styles.down}`}>{s.items24h}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}

export default ControlRoom
