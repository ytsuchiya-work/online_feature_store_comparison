import { useState } from 'react'
import { api, type RunRequest, type ScenarioId } from '../api'

const SCENARIOS: { id: ScenarioId; label: string; hint: string }[] = [
  { id: 'A', label: 'A: 最新値lookup', hint: 'offline vs online の単発/バッチlookup latency' },
  { id: 'B', label: 'B: 時系列lookup', hint: 'offline point-in-time join vs online 最新値' },
  { id: 'C', label: 'C: freshness', hint: 'offline更新 → online反映までの遅延' },
  { id: 'D', label: 'D: 同時実行負荷', hint: '高concurrencyでのlatency/エラー率劣化' },
  { id: 'E', label: 'E: 自動feature lookup', hint: 'Model Serving自動lookup vs 生lookup' },
]

export function ScenarioForm({ onStarted }: { onStarted: (runId: string) => void }) {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('A')
  const [keySet, setKeySet] = useState<RunRequest['key_set']>('small')
  const [accessPattern, setAccessPattern] = useState<RunRequest['access_pattern']>('uniform')
  const [concurrency, setConcurrency] = useState(1)
  const [batchSize, setBatchSize] = useState(1)
  const [requestCount, setRequestCount] = useState(100)
  const [publishMode, setPublishMode] = useState<'TRIGGERED' | 'CONTINUOUS' | ''>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLargeRun = keySet === 'large' || requestCount > 5000 || concurrency > 200

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const body: RunRequest = {
        scenario_id: scenarioId,
        key_set: keySet,
        access_pattern: accessPattern,
        concurrency,
        batch_size: batchSize,
        request_count: requestCount,
        ...(scenarioId === 'C' && publishMode ? { publish_mode: publishMode } : {}),
      }
      const { run_id } = await api.startRun(body)
      onStarted(run_id)
    } catch (e: any) {
      setError(String(e.message ?? e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card">
      <h2>シナリオ実行</h2>
      <div className="scenario-grid">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            className={`scenario-btn ${scenarioId === s.id ? 'active' : ''}`}
            onClick={() => setScenarioId(s.id)}
          >
            <strong>{s.label}</strong>
            <span>{s.hint}</span>
          </button>
        ))}
      </div>

      <div className="form-grid">
        <label>
          Key set
          <select value={keySet} onChange={(e) => setKeySet(e.target.value as any)}>
            <option value="small">small (100)</option>
            <option value="medium">medium (10,000)</option>
            <option value="large">large (1,000,000)</option>
          </select>
        </label>
        <label>
          Access pattern
          <select value={accessPattern} onChange={(e) => setAccessPattern(e.target.value as any)}>
            <option value="uniform">uniform</option>
            <option value="hot">hot (同一キー反復)</option>
            <option value="cold">cold (広く分散)</option>
            <option value="skewed">skewed (80/20)</option>
          </select>
        </label>
        <label>
          Concurrency
          <input type="number" min={1} max={500} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} />
        </label>
        <label>
          Batch size
          <input type="number" min={1} max={1000} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
        </label>
        <label>
          Request count
          <input type="number" min={1} max={1000000} value={requestCount} onChange={(e) => setRequestCount(Number(e.target.value))} />
        </label>
        {scenarioId === 'C' && (
          <label>
            Publish mode切替 (任意)
            <select value={publishMode} onChange={(e) => setPublishMode(e.target.value as any)}>
              <option value="">変更しない</option>
              <option value="TRIGGERED">TRIGGERED</option>
              <option value="CONTINUOUS">CONTINUOUS</option>
            </select>
          </label>
        )}
      </div>

      {isLargeRun && (
        <p className="warning">
          large key set / 高request数 / 高concurrencyの実行はコストに影響します。実行前に規模を確認してください。
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <button className="primary" disabled={submitting} onClick={submit}>
        {submitting ? '実行開始中...' : 'シナリオを実行'}
      </button>
    </div>
  )
}
