import { useEffect, useState, type CSSProperties } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type RunSummary, type SampleConsistency, type SampleRequest } from '../api'

const SOURCE_COLOR: Record<string, string> = {
  offline: '#3b82f6',
  online: '#10b981',
  serving: '#8b5cf6',
  offline_scoring: '#0891b2',
}

const SOURCE_LABEL: Record<string, string> = {
  offline: '🗄️ Offline (Delta)',
  online: '⚡ Online (Lakebase)',
  serving: '🤖 Online推論 (自動lookup)',
  offline_scoring: '🐢 Offline経由推論 (Delta取得+推論)',
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
  const [sampleRequests, setSampleRequests] = useState<SampleRequest[]>([])
  const [sampleConsistency, setSampleConsistency] = useState<SampleConsistency[]>([])

  useEffect(() => {
    let stop = false
    async function poll() {
      try {
        const r = await api.getRun(runId)
        if (stop) return
        setRun(r)
        if (r.status === 'succeeded') {
          const [c, cst, reqs, cons] = await Promise.all([
            api.consistency(runId),
            api.cost(runId),
            api.sampleRequests(runId, 20),
            api.sampleConsistency(runId, 20),
          ])
          if (!stop) {
            setConsistency(c)
            setCost(cst)
            setSampleRequests(reqs)
            setSampleConsistency(cons)
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
      {outcome.offline_vs_online_p50_ms !== undefined && (
        <div className="highlight-box">
          🤖 オフライン経由 − オンライン (p50): <strong>{outcome.offline_vs_online_p50_ms.toFixed(2)} ms</strong>
          {' '}— オフラインFSを1行推論に流用した場合に1リクエストあたり余計にかかる時間
        </div>
      )}
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

      {sampleRequests.length > 0 && (
        <>
          <h3 className="section-heading">🔍 実行内容サンプル（offline/online個別リクエスト）</h3>
          <p className="note">
            このrunで実際にofflineとonlineに対して発行されたlookupの生ログ（先頭{sampleRequests.length}件）。
            latencyや成否がentity単位でどうなっているか、実際の挙動を確認できる。
          </p>
          <table className="metrics-table">
            <thead>
              <tr>
                <th>時刻</th>
                <th>source</th>
                <th>entity_id</th>
                <th>latency(ms)</th>
                <th>成否</th>
                <th>エラー</th>
              </tr>
            </thead>
            <tbody>
              {sampleRequests.map((r) => (
                <tr key={r.request_id}>
                  <td className="date-cell">{new Date(r.request_ts).toLocaleTimeString()}</td>
                  <td>
                    <span style={{ color: SOURCE_COLOR[r.source_type] ?? '#6b7280' }}>
                      {SOURCE_LABEL[r.source_type] ?? r.source_type}
                    </span>
                  </td>
                  <td>{r.entity_id}</td>
                  <td>{r.latency_ms?.toFixed(2)}</td>
                  <td>{r.success ? '✅' : '❌'}</td>
                  <td className="error-cell">{r.error_message ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {sampleConsistency.length > 0 && (
        <>
          <h3 className="section-heading">🧪 実測値サンプル（offline vs online）</h3>
          <p className="note">
            同一entityについて、offlineとonlineが実際に返した値そのものを突き合わせたサンプル（先頭{sampleConsistency.length}件）。
          </p>
          <table className="metrics-table">
            <thead>
              <tr>
                <th>entity_id</th>
                <th>feature</th>
                <th>offline値</th>
                <th>online値</th>
                <th>一致</th>
              </tr>
            </thead>
            <tbody>
              {sampleConsistency.map((c, i) => (
                <tr key={i}>
                  <td>{c.entity_id}</td>
                  <td>{c.feature_name}</td>
                  <td>{c.offline_value}</td>
                  <td>{c.online_value}</td>
                  <td>{c.is_match ? '✅' : '❌'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
