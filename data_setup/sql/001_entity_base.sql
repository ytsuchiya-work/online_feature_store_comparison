-- Base entity table with raw synthetic attributes. Source population for all lookup key sets
-- and the base from which offline feature tables are derived.
CREATE OR REPLACE TABLE ytcy_azure_east2classic_stable.feature_store_comp.entity_base (
  entity_id STRING NOT NULL,
  event_ts TIMESTAMP NOT NULL,
  segment STRING,
  region STRING,
  signup_days_ago INT,
  activity_score DOUBLE,
  attribute_1 DOUBLE,
  attribute_2 DOUBLE,
  attribute_3 STRING
) USING DELTA;

INSERT INTO ytcy_azure_east2classic_stable.feature_store_comp.entity_base
SELECT
  concat('ent_', lpad(cast(id AS STRING), 9, '0')) AS entity_id,
  timestampadd(DAY, cast(rand() * 180 AS INT), timestamp('2026-01-01')) AS event_ts,
  element_at(array('gold', 'silver', 'bronze'), cast(rand() * 3 AS INT) + 1) AS segment,
  element_at(array('east-us', 'west-us', 'eu-west', 'ap-south'), cast(rand() * 4 AS INT) + 1) AS region,
  cast(rand() * 3650 AS INT) AS signup_days_ago,
  round(rand() * 100, 2) AS activity_score,
  round(randn() * 10 + 50, 4) AS attribute_1,
  round(rand() * 1000, 2) AS attribute_2,
  concat('cat_', cast(cast(rand() * 20 AS INT) AS STRING)) AS attribute_3
FROM range(0, 1000000) AS t(id);
