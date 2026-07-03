# Databricks notebook source
# MAGIC %pip install -q -U "databricks-feature-engineering>=0.13.0"
# MAGIC dbutils.library.restartPython()

# COMMAND ----------

CATALOG = "ytcy_azure_east2classic_stable"
SCHEMA = "feature_store_comp"
FQ = lambda name: f"{CATALOG}.{SCHEMA}.{name}"

ONLINE_STORE_NAME = "fscomp-online-store"
ONLINE_STORE_CAPACITY = "CU_1"


def log_step(step: str) -> None:
    spark.sql(
        f"INSERT INTO {FQ('_setup_progress')} SELECT '{step}' AS step, current_timestamp() AS ts"
    )
    print(f"[progress] {step}")


log_step("notebook_started_after_pip_install")

# COMMAND ----------
# MAGIC %md ### 1. Build offline feature tables as real Feature Engineering tables
# MAGIC `feature_offline_current` (latest value per entity) and `feature_offline_timeseries`
# MAGIC (point-in-time, 2 snapshots per entity) are created via `FeatureEngineeringClient.create_table`
# MAGIC so they carry PK/CDF metadata required for `publish_table`.

# COMMAND ----------
from pyspark.sql import functions as F
from databricks.feature_engineering import FeatureEngineeringClient

log_step("imports_done")
fe = FeatureEngineeringClient()
log_step("fe_client_ready")

entity_base = spark.table(FQ("entity_base"))
log_step(f"entity_base_loaded_count={entity_base.count()}")

current_df = (
    entity_base
    .select(
        "entity_id",
        F.current_timestamp().alias("feature_updated_at"),
        F.round(F.col("activity_score") * (F.lit(0.8) + F.rand() * 0.4), 2).alias("activity_score_7d"),
        F.round(F.col("activity_score") * (F.lit(0.9) + F.rand() * 0.3), 2).alias("activity_score_30d"),
        (F.rand() * 50).cast("int").alias("txn_count_7d"),
        F.round(F.rand() * 5000, 2).alias("txn_amount_7d"),
        F.round(F.rand(), 4).alias("risk_score"),
        "segment",
    )
)

spark.sql(f"DROP TABLE IF EXISTS {FQ('feature_offline_current')}")
fe.create_table(
    name=FQ("feature_offline_current"),
    primary_keys=["entity_id"],
    df=current_df,
    description="Latest-value features per entity for real-time serving comparison.",
)
spark.sql(f"ALTER TABLE {FQ('feature_offline_current')} SET TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')")
log_step("created_feature_offline_current")

# COMMAND ----------
# 2 historical snapshots per entity, offset by 0 and 30 days before event_ts, with values that
# drift so a point-in-time lookup at an earlier as-of time returns a genuinely different value
# than the online store's latest snapshot (needed for a meaningful Scenario B consistency check).
snapshots = spark.createDataFrame([(0,), (1,)], ["snapshot_idx"])

timeseries_df = (
    entity_base
    .crossJoin(snapshots)
    .select(
        "entity_id",
        F.when(
            F.col("snapshot_idx") == 0,
            F.date_sub(F.col("event_ts"), 30),
        ).otherwise(F.col("event_ts")).alias("event_ts"),
        F.round(F.col("activity_score") * (F.lit(0.5) + F.col("snapshot_idx") * 0.4 + F.rand() * 0.1), 2).alias("activity_score"),
        (F.rand() * 30).cast("int").alias("txn_count"),
        F.round(F.rand() * 3000, 2).alias("txn_amount"),
        F.round(F.rand(), 4).alias("risk_score"),
    )
)

spark.sql(f"DROP TABLE IF EXISTS {FQ('feature_offline_timeseries')}")
fe.create_table(
    name=FQ("feature_offline_timeseries"),
    primary_keys=["entity_id", "event_ts"],
    timeseries_columns="event_ts",
    df=timeseries_df,
    description="Time series features (2 snapshots/entity) for point-in-time join comparison.",
)
spark.sql(f"ALTER TABLE {FQ('feature_offline_timeseries')} SET TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')")
log_step("created_feature_offline_timeseries")

# COMMAND ----------
# MAGIC %md ### 2. Create the online store (new Lakebase Autoscaling-backed instance)

# COMMAND ----------
import time

existing = fe.get_online_store(name=ONLINE_STORE_NAME)
if existing is None:
    fe.create_online_store(name=ONLINE_STORE_NAME, capacity=ONLINE_STORE_CAPACITY)
    log_step(f"create_online_store_submitted")
else:
    log_step(f"online_store_already_exists_state={existing.state}")

for _ in range(60):
    store = fe.get_online_store(name=ONLINE_STORE_NAME)
    log_step(f"online_store_state={store.state}")
    if "AVAILABLE" in str(store.state):
        break
    time.sleep(15)
else:
    raise RuntimeError("Online store did not become AVAILABLE in time")

# COMMAND ----------
# MAGIC %md ### 3. Publish current + timeseries feature tables (TRIGGERED)

# COMMAND ----------
online_store = fe.get_online_store(name=ONLINE_STORE_NAME)

fe.publish_table(
    online_store=online_store,
    source_table_name=FQ("feature_offline_current"),
    online_table_name=FQ("online_feature_current"),
)
log_step("published_feature_offline_current")

fe.publish_table(
    online_store=online_store,
    source_table_name=FQ("feature_offline_timeseries"),
    online_table_name=FQ("online_feature_timeseries"),
)
log_step("published_feature_offline_timeseries")

# COMMAND ----------
log_step("setup_complete")
print(f"Online store: {fe.get_online_store(name=ONLINE_STORE_NAME)}")
