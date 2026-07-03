import { useState } from 'react'
import { api, type RunRequest, type ScenarioId } from '../api'
import { getScenarioMeta } from '../scenarios'

export function ScenarioForm({ scenarioId, onStarted }: { scenarioId: ScenarioId; onStarted: (runId: string) => void }) {
  const meta = getScenarioMeta(scenarioId)
  const [keySet, setKeySet] = useState<RunRequest['key_set']>(meta.defaults.keySet)
  const [accessPattern, setAccessPattern] = useState<RunRequest['access_pattern']>(meta.defaults.accessPattern)
  const [concurrency, setConcurrency] = useState(meta.defaults.concurrency)
  const [batchSize, setBatchSize] = useState(meta.defaults.batchSize)
  const [requestCount, setRequestCount] = useState(meta.defaults.requestCount)
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
      <h2>{meta.title}</h2>

      <div className="doc-block">
        <h3>この実装がやっていること</h3>
        <ol>
          {meta.howItWorks.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </div>

      <div className="doc-block">
        <h3>何と何を比較しているか</h3>
        <ul>
          {meta.whatItCompares.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="doc-block callout">
        <h3>結果の読み方</h3>
        <p>{meta.howToRead}</p>
        {meta.tip && <p className="tip">💡 {meta.tip}</p>}
      </div>

      <h3>実行パラメータ</h3>
      <div className="form-grid">
        <label>
          {meta.params.keySet.label}
          <select value={keySet} onChange={(e) => setKeySet(e.target.value as any)}>
            <option value="small">small (100)</option>
            <option value="medium">medium (10,000)</option>
            <option value="large">large (1,000,000)</option>
          </select>
          <span className="field-help">{meta.params.keySet.help}</span>
        </label>

        {meta.showAccessPattern && meta.params.accessPattern && (
          <label>
            {meta.params.accessPattern.label}
            <select value={accessPattern} onChange={(e) => setAccessPattern(e.target.value as any)}>
              <option value="uniform">uniform（均等ランダム）</option>
              <option value="hot">hot（同一キー反復）</option>
              <option value="cold">cold（広く分散）</option>
              <option value="skewed">skewed（80/20偏り）</option>
            </select>
            <span className="field-help">{meta.params.accessPattern.help}</span>
          </label>
        )}

        <label>
          {meta.params.concurrency.label}
          <input
            type="number"
            min={1}
            max={500}
            value={concurrency}
            disabled={scenarioId === 'C'}
            onChange={(e) => setConcurrency(Number(e.target.value))}
          />
          <span className="field-help">{meta.params.concurrency.help}</span>
        </label>

        {meta.showBatchSize && meta.params.batchSize && (
          <label>
            {meta.params.batchSize.label}
            <input type="number" min={1} max={1000} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
            <span className="field-help">{meta.params.batchSize.help}</span>
          </label>
        )}

        <label>
          {meta.params.requestCount.label}
          <input
            type="number"
            min={1}
            max={1000000}
            value={requestCount}
            onChange={(e) => setRequestCount(Number(e.target.value))}
          />
          <span className="field-help">{meta.params.requestCount.help}</span>
        </label>

        {meta.showPublishMode && meta.params.publishMode && (
          <label>
            {meta.params.publishMode.label}
            <select value={publishMode} onChange={(e) => setPublishMode(e.target.value as any)}>
              <option value="">変更しない（現在の設定のまま計測）</option>
              <option value="TRIGGERED">TRIGGERED に切り替えてから計測</option>
              <option value="CONTINUOUS">CONTINUOUS に切り替えてから計測</option>
            </select>
            <span className="field-help">{meta.params.publishMode.help}</span>
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
        {submitting ? '実行開始中...' : `シナリオ${scenarioId}を実行`}
      </button>
    </div>
  )
}
