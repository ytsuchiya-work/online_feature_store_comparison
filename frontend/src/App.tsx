import { useState } from 'react'
import './App.css'
import { Dashboard } from './components/Dashboard'
import { RunDetail } from './components/RunDetail'
import { RunList } from './components/RunList'
import { ScenarioForm } from './components/ScenarioForm'

type Tab = 'run' | 'dashboard'

function App() {
  const [tab, setTab] = useState<Tab>('run')
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>()
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="app">
      <header>
        <h1>Online vs Offline Feature Store Benchmark</h1>
        <nav>
          <button className={tab === 'run' ? 'active' : ''} onClick={() => setTab('run')}>
            実行 / 履歴
          </button>
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
            ダッシュボード
          </button>
        </nav>
      </header>

      {tab === 'run' && (
        <div className="layout">
          <div className="col">
            <ScenarioForm
              onStarted={(id) => {
                setSelectedRunId(id)
                setRefreshKey((k) => k + 1)
              }}
            />
            <RunList selectedRunId={selectedRunId} onSelect={setSelectedRunId} refreshKey={refreshKey} />
          </div>
          <div className="col">{selectedRunId && <RunDetail runId={selectedRunId} />}</div>
        </div>
      )}

      {tab === 'dashboard' && <Dashboard />}
    </div>
  )
}

export default App
