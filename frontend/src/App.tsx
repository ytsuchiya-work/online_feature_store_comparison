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
      <header>
        <h1>Online vs Offline Feature Store Benchmark</h1>
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
            {s.shortLabel}
          </button>
        ))}
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
          📊 ダッシュボード
        </button>
      </nav>

      {tab !== 'dashboard' && (
        <div className="layout">
          <div className="col">
            <ScenarioForm
              scenarioId={tab}
              onStarted={(id) => {
                setSelectedRunId(id)
                setRefreshKey((k) => k + 1)
              }}
            />
            <RunList scenarioId={tab} selectedRunId={selectedRunId} onSelect={setSelectedRunId} refreshKey={refreshKey} />
          </div>
          <div className="col">{selectedRunId && <RunDetail runId={selectedRunId} />}</div>
        </div>
      )}

      {tab === 'dashboard' && <Dashboard />}
    </div>
  )
}

export default App
