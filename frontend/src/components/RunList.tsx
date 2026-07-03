import { useEffect, useState } from 'react'
import { api, type RunSummary, type ScenarioId } from '../api'

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '待機中', color: '#9ca3af' },
  running: { label: '実行中', color: '#3b82f6' },
  succeeded: { label: '成功', color: '#10b981' },
  failed: { label: '失敗', color: '#ef4444' },
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
          {runs.map((r) => {
            const meta = STATUS_META[r.status] ?? { label: r.status, color: '#9ca3af' }
            return (
              <tr key={r.run_id} className={r.run_id === selectedRunId ? 'selected' : ''} onClick={() => onSelect(r.run_id)}>
                <td>
                  <span className="scenario-chip">{r.scenario_id}</span>
                </td>
                <td>
                  <span className="status-pill sm" style={{ background: `${meta.color}1a`, color: meta.color }}>
                    <span className="status-dot" style={{ background: meta.color }} />
                    {meta.label}
                  </span>
                </td>
                <td className="config-cell">
                  {r.config?.key_set} · c={r.config?.concurrency} · n={r.config?.request_count}
                </td>
                <td className="date-cell">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            )
          })}
          {runs.length === 0 && (
            <tr>
              <td colSpan={4} className="empty-cell">
                まだ実行がありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
