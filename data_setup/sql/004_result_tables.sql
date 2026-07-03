-- Tables written by the benchmark app itself (run metadata, raw request logs, aggregated
-- results, offline/online value consistency checks, and cost estimates per run).
CREATE OR REPLACE TABLE ytcy_azure_east2classic_stable.feature_store_comp.benchmark_scenarios (
  run_id STRING NOT NULL,
  scenario_id STRING NOT NULL,
  scenario_name STRING,
  access_pattern STRING,
  concurrency INT,
  batch_size INT,
  publish_mode STRING,
  feature_set STRING,
  key_set STRING,
  created_at TIMESTAMP
) USING DELTA;

CREATE OR REPLACE TABLE ytcy_azure_east2classic_stable.feature_store_comp.benchmark_requests (
  run_id STRING NOT NULL,
  request_id STRING NOT NULL,
  entity_id STRING,
  request_ts TIMESTAMP,
  source_type STRING,
  latency_ms DOUBLE,
  success BOOLEAN,
  error_message STRING
) USING DELTA;

CREATE OR REPLACE TABLE ytcy_azure_east2classic_stable.feature_store_comp.benchmark_results (
  run_id STRING NOT NULL,
  source_type STRING NOT NULL,
  p50_ms DOUBLE,
  p95_ms DOUBLE,
  p99_ms DOUBLE,
  qps DOUBLE,
  error_rate DOUBLE,
  freshness_lag_ms DOUBLE,
  request_count INT,
  computed_at TIMESTAMP
) USING DELTA;

CREATE OR REPLACE TABLE ytcy_azure_east2classic_stable.feature_store_comp.value_consistency_results (
  run_id STRING NOT NULL,
  entity_id STRING NOT NULL,
  feature_name STRING NOT NULL,
  offline_value STRING,
  online_value STRING,
  is_match BOOLEAN,
  checked_at TIMESTAMP
) USING DELTA;

CREATE OR REPLACE TABLE ytcy_azure_east2classic_stable.feature_store_comp.cost_snapshots (
  run_id STRING NOT NULL,
  online_store_capacity STRING,
  elapsed_sec DOUBLE,
  estimated_cu_hours DOUBLE,
  window_start TIMESTAMP,
  window_end TIMESTAMP,
  created_at TIMESTAMP
) USING DELTA;
