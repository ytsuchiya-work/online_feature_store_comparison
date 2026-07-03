-- Lookup key pools used by the benchmark runner. access_pattern (uniform/hot/cold/skewed)
-- is applied at query time by the benchmark engine when sampling from these pools,
-- per benchmark_scenarios.access_pattern -- these tables only hold the candidate entity_id sets.
CREATE OR REPLACE TABLE ytcy_azure_east2classic_stable.feature_store_comp.lookup_keys_small AS
SELECT entity_id FROM ytcy_azure_east2classic_stable.feature_store_comp.entity_base
TABLESAMPLE (100 ROWS);

CREATE OR REPLACE TABLE ytcy_azure_east2classic_stable.feature_store_comp.lookup_keys_medium AS
SELECT entity_id FROM ytcy_azure_east2classic_stable.feature_store_comp.entity_base
TABLESAMPLE (10000 ROWS);

CREATE OR REPLACE TABLE ytcy_azure_east2classic_stable.feature_store_comp.lookup_keys_large AS
SELECT entity_id FROM ytcy_azure_east2classic_stable.feature_store_comp.entity_base;
