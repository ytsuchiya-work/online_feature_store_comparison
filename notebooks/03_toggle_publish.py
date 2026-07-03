# Databricks notebook source
# MAGIC %pip install -q "databricks-feature-engineering>=0.13.0"
# MAGIC dbutils.library.restartPython()

# COMMAND ----------
dbutils.widgets.text("source_table", "")
dbutils.widgets.text("online_table", "")
dbutils.widgets.text("mode", "TRIGGERED")
dbutils.widgets.text("online_store_name", "fscomp-online-store")

source_table = dbutils.widgets.get("source_table")
online_table = dbutils.widgets.get("online_table")
mode = dbutils.widgets.get("mode")
online_store_name = dbutils.widgets.get("online_store_name")

# COMMAND ----------
from databricks.feature_engineering import FeatureEngineeringClient

fe = FeatureEngineeringClient()
online_store = fe.get_online_store(name=online_store_name)

fe.publish_table(
    online_store=online_store,
    source_table_name=source_table,
    online_table_name=online_table,
    publish_mode=mode,
)
print(f"Re-published {source_table} -> {online_table} with publish_mode={mode}")
