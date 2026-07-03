import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type RunSummary } from '../api'

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
    }))

  return (
    <div className="card">
      <h2>
        Run {run.run_id.slice(0, 8)} — シナリオ{run.scenario_id} ({run.status})
      </h2>
      {run.status === 'failed' && <pre className="error">{run.error}</pre>}

      {chartData.length > 0 && (
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="source" />
              <YAxis label={{ value: 'ms', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="p50" fill="#3b82f6" name="p50 (ms)" />
              <Bar dataKey="p95" fill="#f59e0b" name="p95 (ms)" />
              <Bar dataKey="p99" fill="#dc2626" name="p99 (ms)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {chartData.length > 0 && (
        <table className="metrics-table">
          <thead>
            <tr>
              <th>source</th>
              <th>p50</th>
              <th>p95</th>
              <th>p99</th>
              <th>qps</th>
              <th>error rate</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((d) => (
              <tr key={d.source}>
                <td>{d.source}</td>
                <td>{d.p50?.toFixed(2)}</td>
                <td>{d.p95?.toFixed(2)}</td>
                <td>{d.p99?.toFixed(2)}</td>
                <td>{d.qps?.toFixed(2)}</td>
                <td>{(d.error_rate * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {outcome.avg_freshness_lag_ms !== undefined && (
        <p>
          平均 freshness lag: <strong>{outcome.avg_freshness_lag_ms?.toFixed(0)} ms</strong> (publish_mode: {outcome.publish_mode})
        </p>
      )}
      {outcome.note && <p className="note">{outcome.note}</p>}
      {outcome.lookup_overhead_p50_ms !== undefined && (
        <p>
          自動feature lookupのoverhead (p50): <strong>{outcome.lookup_overhead_p50_ms.toFixed(2)} ms</strong>
        </p>
      )}

      {consistency.length > 0 && (
        <>
          <h3>Value consistency</h3>
          <table className="metrics-table">
            <thead>
              <tr>
                <th>feature</th>
                <th>match rate</th>
                <th>total</th>
              </tr>
            </thead>
            <tbody>
              {consistency.map((c) => (
                <tr key={c.feature_name}>
                  <td>{c.feature_name}</td>
                  <td>{c.match_rate !== null ? `${(c.match_rate * 100).toFixed(1)}%` : '-'}</td>
                  <td>{c.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {cost?.snapshot && (
        <>
          <h3>コスト概算</h3>
          <p>
            capacity: {cost.snapshot.online_store_capacity} / elapsed: {cost.snapshot.elapsed_sec?.toFixed(1)}s / estimated CU-hours:{' '}
            {cost.snapshot.estimated_cu_hours}
          </p>
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
