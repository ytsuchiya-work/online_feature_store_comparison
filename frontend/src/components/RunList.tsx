import { useEffect, useState } from 'react'
import { api, type RunSummary, type ScenarioId } from '../api'

const STATUS_COLOR: Record<string, string> = {
  pending: '#999',
  running: '#3b82f6',
  succeeded: '#16a34a',
  failed: '#dc2626',
}

export function RunList({
  scenarioId,
  selectedRunId,
  onSelect,
  refreshKey,
}: {
  scenarioId?: ScenarioId
  selectedRunId?: string
  onSelect: (id: string) => void
  refreshKey: number
}) {
  const [runs, setRuns] = useState<RunSummary[]>([])

  useEffect(() => {
    let stop = false
    async function poll() {
      try {
        const data = await api.listRuns()
        if (!stop) setRuns(scenarioId ? data.filter((r) => r.scenario_id === scenarioId) : data)
      } catch (e) {
        // ignore transient errors
      }
    }
    poll()
    const t = setInterval(poll, 3000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [refreshKey, scenarioId])

  return (
    <div className="card">
      <h2>{scenarioId ? `シナリオ${scenarioId}の実行履歴` : '実行履歴'}</h2>
      <table className="run-table">
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Status</th>
            <th>Config</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.run_id} className={r.run_id === selectedRunId ? 'selected' : ''} onClick={() => onSelect(r.run_id)}>
              <td>{r.scenario_id}</td>
              <td>
                <span className="status-dot" style={{ background: STATUS_COLOR[r.status] }} />
                {r.status}
              </td>
              <td>
                {r.config?.key_set} / c={r.config?.concurrency} / n={r.config?.request_count}
              </td>
              <td>{new Date(r.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {runs.length === 0 && (
            <tr>
              <td colSpan={4}>まだ実行がありません</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
