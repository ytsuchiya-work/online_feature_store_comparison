export type ScenarioId = 'A' | 'B' | 'C' | 'D' | 'E'
export type AccessPattern = 'uniform' | 'hot' | 'cold' | 'skewed'
export type KeySet = 'small' | 'medium' | 'large'

export interface RunRequest {
  scenario_id: ScenarioId
  key_set: KeySet
  access_pattern: AccessPattern
  concurrency: number
  batch_size: number
  request_count: number
  publish_mode?: 'TRIGGERED' | 'CONTINUOUS'
}

export interface RunSummary {
  run_id: string
  scenario_id: ScenarioId
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  created_at: string
  config: RunRequest
  outcome: any
  error: string | null
}

export interface ResultRow {
  run_id: string
  scenario_id: string
  scenario_name: string
  access_pattern: string
  concurrency: number
  batch_size: number
  publish_mode: string | null
  key_set: string
  created_at: string
  source_type: string
  p50_ms: number
  p95_ms: number
  p99_ms: number
  qps: number
  error_rate: number
  freshness_lag_ms: number | null
  request_count: number
}

const BASE = '/api'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`)
  }
  return res.json()
}

export const api = {
  startRun: (body: RunRequest) => req<{ run_id: string }>('/runs', { method: 'POST', body: JSON.stringify(body) }),
  listRuns: () => req<RunSummary[]>('/runs'),
  getRun: (runId: string) => req<RunSummary>(`/runs/${runId}`),
  dashboardResults: () => req<ResultRow[]>('/dashboard/results'),
  consistency: (runId: string) => req<any[]>(`/dashboard/consistency/${runId}`),
  cost: (runId: string) => req<any>(`/dashboard/cost/${runId}`),
}
