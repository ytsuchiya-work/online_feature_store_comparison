import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type ResultRow, type ScenarioId } from '../api'
import { SCENARIOS } from '../scenarios'

const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)

export function Dashboard() {
  const [rows, setRows] = useState<ResultRow[]>([])
  const [concurrencyScenario, setConcurrencyScenario] = useState<ScenarioId>('C')

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

  // Group by concurrency, keeping offline/online separate, and average duplicate runs at the
  // same concurrency so each concurrency value renders as exactly one bar per source.
  const concurrencyGroups = new Map<number, { offline: number[]; online: number[] }>()
  for (const r of rows) {
    if (r.scenario_id !== concurrencyScenario) continue
    if (r.source_type !== 'offline' && r.source_type !== 'online') continue
    if (!concurrencyGroups.has(r.concurrency)) concurrencyGroups.set(r.concurrency, { offline: [], online: [] })
    concurrencyGroups.get(r.concurrency)![r.source_type].push(r.p95_ms)
  }
  const concurrencySeries = Array.from(concurrencyGroups.entries())
    .sort(([a], [b]) => a - b)
    .map(([concurrency, vals]) => ({
      concurrency,
      offline_p95: avg(vals.offline) ?? undefined,
      online_p95: avg(vals.online) ?? undefined,
    }))

  const offlineRows = rows.filter((r) => r.source_type === 'offline')
  const onlineRows = rows.filter((r) => r.source_type === 'online')
  const avgOfflineP50 = avg(offlineRows.map((r) => r.p50_ms))
  const avgOnlineP50 = avg(onlineRows.map((r) => r.p50_ms))

  return (
    <div className="card">
      <h2>ダッシュボード: 全実行の集計</h2>
      <div className="doc-block callout">
        <h3>このページで確認できること</h3>
        <ul>
          <li>
            <strong>Offline vs Online の速度差</strong> — 下の要約カードで、これまでの全実行の平均p50を比較できる。
            通常はonlineがofflineより1〜2桁速い。
          </li>
          <li>
            <strong>Concurrency別 p95 latency</strong> — プルダウンで選んだシナリオについて、同じ設定でconcurrencyだけ変えて
            複数回実行した結果をoffline/online別の棒グラフで比較できる。バーが急に高くなっていれば、その並列度あたりで
            性能劣化が始まっていることを示す（同じシナリオ・同じconcurrencyの実行が複数あれば平均値を表示）。
          </li>
          <li>
            <strong>全実行結果テーブル</strong> — すべてのシナリオ・実行の生の集計値一覧。特定の run を見比べたいときはこちらを参照。
            error%が0でなければ、その実行で何らかのlookup/更新が失敗している。
          </li>
        </ul>
        <p>より詳しい内訳（value consistencyやコスト概算）は各シナリオタブから該当runをクリックして「実行/履歴」側の詳細で確認できる。</p>
      </div>

      {(avgOfflineP50 !== null || avgOnlineP50 !== null) && (
        <div className="summary-cards">
          <div className="summary-card">
            <span className="summary-label">Offline 平均 p50</span>
            <span className="summary-value">{avgOfflineP50 !== null ? `${avgOfflineP50.toFixed(1)} ms` : '-'}</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">Online 平均 p50</span>
            <span className="summary-value">{avgOnlineP50 !== null ? `${avgOnlineP50.toFixed(1)} ms` : '-'}</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">速度差（倍率）</span>
            <span className="summary-value">
              {avgOfflineP50 && avgOnlineP50 ? `${(avgOfflineP50 / avgOnlineP50).toFixed(1)}x` : '-'}
            </span>
          </div>
        </div>
      )}

      <div className="concurrency-chart-head">
        <h3>Concurrency別 p95 latency</h3>
        <label className="scenario-select">
          <span>シナリオ</span>
          <select value={concurrencyScenario} onChange={(e) => setConcurrencyScenario(e.target.value as ScenarioId)}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.shortLabel}
              </option>
            ))}
          </select>
        </label>
      </div>
      {concurrencySeries.length > 0 ? (
        <>
          <p className="note">
            横軸=concurrency（同時実行数）、縦軸=p95レイテンシ(ms)。offlineとonlineを棒で並べて表示し、
            同じconcurrencyで複数回実行している場合はその平均値を1本のバーとして示す。
            バーが急激に高くなる地点が、そのバックエンドの実質的な限界に近い並列度。
          </p>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={concurrencySeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="concurrency" label={{ value: 'concurrency', position: 'insideBottom', offset: -5 }} />
                <YAxis label={{ value: 'p95 (ms)', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="offline_p95" fill="#3b82f6" name="offline p95" />
                <Bar dataKey="online_p95" fill="#16a34a" name="online p95" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <p className="note">
          シナリオ{concurrencyScenario}でconcurrencyを変えた実行がまだありません。該当シナリオのタブでconcurrencyを変えながら
          複数回実行すると、ここに比較チャートが表示されます。
        </p>
      )}

      <h3>全実行結果</h3>
      <p className="note">
        1行 = 1実行(run) × 1経路(source)。同じrun_idでofflineとonline（、E実行時はserving）の行がペアになっているので、
        run_idで絞り込んで見比べると比較しやすい。
      </p>
      <table className="metrics-table">
        <thead>
          <tr>
            <th title="実行ID">run</th>
            <th title="A〜Eのどのシナリオか">scenario</th>
            <th title="offline(Delta) / online(Lakebase) / serving(Model Serving)">source</th>
            <th title="lookup対象プールのサイズ">key_set</th>
            <th title="同時実行数">concurrency</th>
            <th title="中央値レイテンシ(ms)">p50</th>
            <th title="95パーセンタイルレイテンシ(ms)">p95</th>
            <th title="99パーセンタイルレイテンシ(ms)">p99</th>
            <th title="秒間リクエスト数">qps</th>
            <th title="エラー率(%)">error%</th>
            <th title="freshness計測時のみ: 更新反映までの遅延(ms)">freshness(ms)</th>
            <th title="実行が作成された日時">Created Time</th>
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
              <td className="date-cell">{new Date(r.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={12}>まだ実行結果がありません。各シナリオタブから実行してください。</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
