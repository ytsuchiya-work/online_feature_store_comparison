import { useState, type CSSProperties } from 'react'
import { api, type RunRequest, type ScenarioId } from '../api'
import { getScenarioMeta } from '../scenarios'

function FieldHelp({ help }: { help: string[] }) {
  return (
    <ul className="field-help">
      {help.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  )
}

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
    <div className="card scenario-card" style={{ '--accent': meta.accent } as CSSProperties}>
      <div className="scenario-card-head">
        <span className="scenario-icon-badge">{meta.icon}</span>
        <h2>{meta.title}</h2>
      </div>

      <div className="doc-grid">
        <div className="doc-panel">
          <h3>
            <span className="doc-icon">⚙️</span> この実装がやっていること
          </h3>
          <ol>
            {meta.howItWorks.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </div>

        <div className="doc-panel">
          <h3>
            <span className="doc-icon">⚖️</span> 何と何を比較しているか
          </h3>
          <ul>
            {meta.whatItCompares.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="doc-block callout">
        <h3>
          <span className="doc-icon">💡</span> 結果の読み方
        </h3>
        <p>{meta.howToRead}</p>
        {meta.tip && <p className="tip">✨ {meta.tip}</p>}
      </div>

      <h3 className="params-heading">実行パラメータ</h3>
      <div className="form-grid">
        <label className="param-card">
          <span className="param-title">{meta.params.keySet.label}</span>
          <select value={keySet} onChange={(e) => setKeySet(e.target.value as any)}>
            <option value="small">small (100)</option>
            <option value="medium">medium (10,000)</option>
            <option value="large">large (1,000,000)</option>
          </select>
          <FieldHelp help={meta.params.keySet.help} />
        </label>

        {meta.showAccessPattern && meta.params.accessPattern && (
          <label className="param-card">
            <span className="param-title">{meta.params.accessPattern.label}</span>
            <select value={accessPattern} onChange={(e) => setAccessPattern(e.target.value as any)}>
              <option value="uniform">uniform（均等ランダム）</option>
              <option value="hot">hot（同一キー反復）</option>
              <option value="cold">cold（広く分散）</option>
              <option value="skewed">skewed（80/20偏り）</option>
            </select>
            <FieldHelp help={meta.params.accessPattern.help} />
          </label>
        )}

        <label className="param-card">
          <span className="param-title">{meta.params.concurrency.label}</span>
          <input
            type="number"
            min={1}
            max={500}
            value={concurrency}
            disabled={scenarioId === 'C'}
            onChange={(e) => setConcurrency(Number(e.target.value))}
          />
          <FieldHelp help={meta.params.concurrency.help} />
        </label>

        {meta.showBatchSize && meta.params.batchSize && (
          <label className="param-card">
            <span className="param-title">{meta.params.batchSize.label}</span>
            <input type="number" min={1} max={1000} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
            <FieldHelp help={meta.params.batchSize.help} />
          </label>
        )}

        <label className="param-card">
          <span className="param-title">{meta.params.requestCount.label}</span>
          <input
            type="number"
            min={1}
            max={1000000}
            value={requestCount}
            onChange={(e) => setRequestCount(Number(e.target.value))}
          />
          <FieldHelp help={meta.params.requestCount.help} />
        </label>

        {meta.showPublishMode && meta.params.publishMode && (
          <label className="param-card">
            <span className="param-title">{meta.params.publishMode.label}</span>
            <select value={publishMode} onChange={(e) => setPublishMode(e.target.value as any)}>
              <option value="">変更しない（現在の設定のまま計測）</option>
              <option value="TRIGGERED">TRIGGERED に切り替えてから計測</option>
              <option value="CONTINUOUS">CONTINUOUS に切り替えてから計測</option>
            </select>
            <FieldHelp help={meta.params.publishMode.help} />
          </label>
        )}
      </div>

      {isLargeRun && (
        <p className="warning">
          ⚠️ large key set / 高request数 / 高concurrencyの実行はコストに影響します。実行前に規模を確認してください。
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <button className="primary" disabled={submitting} onClick={submit}>
        {submitting ? (
          <>
            <span className="spinner" /> 実行開始中...
          </>
        ) : (
          <>▶ シナリオ{scenarioId}を実行</>
        )}
      </button>
    </div>
  )
}
