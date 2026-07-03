-- Synthetic label for the Scenario E model (churn-style binary target correlated with
-- activity_score/signup_days_ago so the trained model has non-trivial signal).
CREATE OR REPLACE TABLE ytcy_azure_east2classic_stable.feature_store_comp.labels_optional (
  entity_id STRING NOT NULL,
  label INT NOT NULL,
  labeled_at TIMESTAMP
) USING DELTA;

INSERT INTO ytcy_azure_east2classic_stable.feature_store_comp.labels_optional
SELECT
  entity_id,
  CASE
    WHEN (100 - activity_score) / 100.0 + (signup_days_ago / 3650.0) + (rand() - 0.5) * 0.6 > 0.75
      THEN 1 ELSE 0
  END AS label,
  current_timestamp() AS labeled_at
FROM ytcy_azure_east2classic_stable.feature_store_comp.entity_base;
