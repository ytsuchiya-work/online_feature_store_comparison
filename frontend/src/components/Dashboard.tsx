import { useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type ResultRow } from '../api'

export function Dashboard() {
  const [rows, setRows] = useState<ResultRow[]>([])

  useEffect(() => {
    let stop = false
    async function poll() {
      try {
        const data = await api.dashboardResults()
        if (!stop) setRows(data)
      } catch (e) {
        // ignore
      }
    }
    poll()
    const t = setInterval(poll, 5000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [])

  const concurrencySeries = rows
    .filter((r) => r.scenario_id === 'D')
    .sort((a, b) => a.concurrency - b.concurrency)
    .map((r) => ({ concurrency: r.concurrency, [`${r.source_type}_p95`]: r.p95_ms, [`${r.source_type}_qps`]: r.qps }))

  return (
    <div className="card">
      <h2>ダッシュボード: 全実行の集計</h2>

      {concurrencySeries.length > 0 && (
        <>
          <h3>Concurrency別 p95 latency (シナリオD)</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={concurrencySeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="concurrency" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="offline_p95" stroke="#3b82f6" name="offline p95" />
                <Line type="monotone" dataKey="online_p95" stroke="#16a34a" name="online p95" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <h3>全実行結果</h3>
      <table className="metrics-table">
        <thead>
          <tr>
            <th>run</th>
            <th>scenario</th>
            <th>source</th>
            <th>key_set</th>
            <th>concurrency</th>
            <th>p50</th>
            <th>p95</th>
            <th>p99</th>
            <th>qps</th>
            <th>error%</th>
            <th>freshness(ms)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.run_id.slice(0, 8)}</td>
              <td>{r.scenario_id}</td>
              <td>{r.source_type}</td>
              <td>{r.key_set}</td>
              <td>{r.concurrency}</td>
              <td>{r.p50_ms?.toFixed(2)}</td>
              <td>{r.p95_ms?.toFixed(2)}</td>
              <td>{r.p99_ms?.toFixed(2)}</td>
              <td>{r.qps?.toFixed(2)}</td>
              <td>{(r.error_rate * 100).toFixed(1)}</td>
              <td>{r.freshness_lag_ms ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
