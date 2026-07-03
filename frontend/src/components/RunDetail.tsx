import { useEffect, useState, type CSSProperties } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type RunSummary } from '../api'

const SOURCE_COLOR: Record<string, string> = {
  offline: '#3b82f6',
  online: '#10b981',
  serving: '#8b5cf6',
}

const SOURCE_LABEL: Record<string, string> = {
  offline: '🗄️ Offline (Delta)',
  online: '⚡ Online (Lakebase)',
  serving: '🤖 Serving (自動lookup)',
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '待機中', color: '#9ca3af' },
  running: { label: '実行中', color: '#3b82f6' },
  succeeded: { label: '成功', color: '#10b981' },
  failed: { label: '失敗', color: '#ef4444' },
}

export function RunDetail({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunSummary | null>(null)
  const [consistency, setConsistency] = useState<any[]>([])
  const [cost, setCost] = useState<any | null>(null)

  useEffect(() => {
    let stop = false
    async function poll() {
      try {
        const r = await api.getRun(runId)
        if (stop) return
        setRun(r)
        if (r.status === 'succeeded') {
          const [c, cst] = await Promise.all([api.consistency(runId), api.cost(runId)])
          if (!stop) {
            setConsistency(c)
            setCost(cst)
          }
        }
      } catch (e) {
        // ignore
      }
    }
    poll()
    const t = setInterval(poll, 2000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [runId])

  if (!run) return <div className="card">Loading...</div>

  const outcome = run.outcome ?? {}
  const chartData = Object.entries(outcome)
    .filter(([, v]) => typeof v === 'object' && v && 'p50_ms' in v)
    .map(([source, v]: any) => ({
      source,
      p50: v.p50_ms,
      p95: v.p95_ms,
      p99: v.p99_ms,
      qps: v.qps,
      error_rate: v.error_rate,
      request_count: v.request_count,
    }))

  const statusMeta = STATUS_META[run.status] ?? { label: run.status, color: '#9ca3af' }

  return (
    <div className="card run-detail">
      <div className="run-detail-head">
        <div>
          <span className="eyebrow">Run {run.run_id.slice(0, 8)}</span>
          <h2>シナリオ {run.scenario_id}</h2>
        </div>
        <span className="status-pill" style={{ background: `${statusMeta.color}1a`, color: statusMeta.color }}>
          <span className="status-dot" style={{ background: statusMeta.color }} />
          {run.status === 'running' && <span className="status-dot pulse" style={{ background: statusMeta.color }} />}
          {statusMeta.label}
        </span>
      </div>

      {run.status === 'failed' && <pre className="error">{run.error}</pre>}

      {chartData.length > 0 && (
        <>
          <div className="stat-tile-grid">
            {chartData.map((d) => (
              <div className="stat-tile" key={d.source} style={{ '--tile-accent': SOURCE_COLOR[d.source] ?? '#6b7280' } as CSSProperties}>
                <span className="stat-tile-label">{SOURCE_LABEL[d.source] ?? d.source}</span>
                <span className="stat-tile-value">{d.p50?.toFixed(2)} ms</span>
                <span className="stat-tile-sub">p50 latency</span>
                <div className="stat-tile-meta">
                  <span>p95 {d.p95?.toFixed(2)}ms</span>
                  <span>p99 {d.p99?.toFixed(2)}ms</span>
                  <span>{d.qps?.toFixed(1)} qps</span>
                  <span className={d.error_rate > 0 ? 'stat-tile-error' : ''}>err {(d.error_rate * 100).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ width: '100%', height: 280, marginTop: 20 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" />
                <XAxis dataKey="source" tickFormatter={(s) => SOURCE_LABEL[s] ?? s} />
                <YAxis label={{ value: 'ms', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="p50" fill="#93c5fd" name="p50 (ms)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="p95" fill="#f59e0b" name="p95 (ms)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="p99" fill="#dc2626" name="p99 (ms)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {outcome.avg_freshness_lag_ms !== undefined && (
        <div className="highlight-box">
          🔄 平均 freshness lag: <strong>{outcome.avg_freshness_lag_ms?.toFixed(0)} ms</strong>（publish_mode: {outcome.publish_mode}）
        </div>
      )}
      {outcome.note && <p className="note">ℹ️ {outcome.note}</p>}
      {outcome.lookup_overhead_p50_ms !== undefined && (
        <div className="highlight-box">
          🤖 自動feature lookupのoverhead (p50): <strong>{outcome.lookup_overhead_p50_ms.toFixed(2)} ms</strong>
        </div>
      )}

      {consistency.length > 0 && (
        <>
          <h3 className="section-heading">✅ Value consistency</h3>
          <div className="consistency-grid">
            {consistency.map((c) => {
              const pct = c.match_rate !== null ? c.match_rate * 100 : null
              const color = pct === null ? '#9ca3af' : pct >= 99 ? '#10b981' : pct >= 50 ? '#d97706' : '#ef4444'
              return (
                <div className="consistency-tile" key={c.feature_name}>
                  <span className="consistency-feature">{c.feature_name}</span>
                  <span className="consistency-rate" style={{ color }}>
                    {pct !== null ? `${pct.toFixed(1)}%` : '-'}
                  </span>
                  <div className="consistency-bar">
                    <div className="consistency-bar-fill" style={{ width: `${pct ?? 0}%`, background: color }} />
                  </div>
                  <span className="consistency-total">{c.total} 件中一致</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {cost?.snapshot && (
        <>
          <h3 className="section-heading">💰 コスト概算</h3>
          <div className="stat-tile-grid">
            <div className="stat-tile" style={{ '--tile-accent': '#6b7280' } as CSSProperties}>
              <span className="stat-tile-label">Capacity</span>
              <span className="stat-tile-value">{cost.snapshot.online_store_capacity}</span>
            </div>
            <div className="stat-tile" style={{ '--tile-accent': '#6b7280' } as CSSProperties}>
              <span className="stat-tile-label">Elapsed</span>
              <span className="stat-tile-value">{cost.snapshot.elapsed_sec?.toFixed(1)}s</span>
            </div>
            <div className="stat-tile" style={{ '--tile-accent': '#6b7280' } as CSSProperties}>
              <span className="stat-tile-label">Estimated CU-hours</span>
              <span className="stat-tile-value">{cost.snapshot.estimated_cu_hours}</span>
            </div>
          </div>
          {cost.extrapolation && (
            <table className="metrics-table">
              <thead>
                <tr>
                  <th>lookups</th>
                  <th>推定CU-hours</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(cost.extrapolation).map(([n, v]: any) => (
                  <tr key={n}>
                    <td>{Number(n).toLocaleString()}</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}
