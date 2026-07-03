import { useState } from 'react'
import './App.css'
import { Dashboard } from './components/Dashboard'
import { RunDetail } from './components/RunDetail'
import { RunList } from './components/RunList'
import { ScenarioForm } from './components/ScenarioForm'
import type { ScenarioId } from './api'
import { SCENARIOS } from './scenarios'

type Tab = ScenarioId | 'dashboard'

function App() {
  const [tab, setTab] = useState<Tab>('A')
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>()
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">⚡</span>
          <div>
            <h1>Feature Store Benchmark</h1>
            <p className="brand-sub">Lakebase Online vs Offline — latency &amp; freshness comparison</p>
          </div>
        </div>
      </header>

      <nav className="scenario-tabs">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            className={tab === s.id ? 'active' : ''}
            onClick={() => {
              setTab(s.id)
              setSelectedRunId(undefined)
            }}
          >
            <span className="tab-icon">{s.icon}</span>
            {s.shortLabel}
          </button>
        ))}
        <button className={`dashboard-tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
          <span className="tab-icon">📊</span>
          ダッシュボード
        </button>
      </nav>

      {tab !== 'dashboard' && (
        <div className="stack">
          <section className="tier">
            <div className="tier-label">
              <span className="tier-index">1</span> シナリオ
            </div>
            <ScenarioForm
              scenarioId={tab}
              onStarted={(id) => {
                setSelectedRunId(id)
                setRefreshKey((k) => k + 1)
              }}
            />
          </section>

          <section className="tier">
            <div className="tier-label">
              <span className="tier-index">2</span> 結果
            </div>
            {selectedRunId ? (
              <RunDetail runId={selectedRunId} />
            ) : (
              <div className="card empty-state">実行するか、下の履歴から run を選ぶと結果がここに表示されます。</div>
            )}
          </section>

          <section className="tier">
            <div className="tier-label">
              <span className="tier-index">3</span> 実行履歴
            </div>
            <RunList scenarioId={tab} selectedRunId={selectedRunId} onSelect={setSelectedRunId} refreshKey={refreshKey} />
          </section>
        </div>
      )}

      {tab === 'dashboard' && <Dashboard />}
    </div>
  )
}

export default App
