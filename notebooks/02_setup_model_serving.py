# Databricks notebook source
# MAGIC %pip install -q -U "databricks-feature-engineering>=0.13.0"
# MAGIC dbutils.library.restartPython()

# COMMAND ----------

CATALOG = "ytcy_azure_east2classic_stable"
SCHEMA = "feature_store_comp"
FQ = lambda name: f"{CATALOG}.{SCHEMA}.{name}"

MODEL_NAME = FQ("fscomp_churn_model")
ENDPOINT_NAME = "fscomp-churn-serving"


def log_step(step: str) -> None:
    spark.sql(
        f"INSERT INTO {FQ('_setup_progress')} SELECT '{step}' AS step, current_timestamp() AS ts"
    )
    print(f"[progress] {step}")


log_step("nb02_started_after_pip_install")

# COMMAND ----------
# MAGIC %md ### 1. Build a training set via FeatureLookup (drives automatic feature lookup at serving time)

# COMMAND ----------
import mlflow
from sklearn.linear_model import LogisticRegression
from databricks.feature_engineering import FeatureEngineeringClient, FeatureLookup

fe = FeatureEngineeringClient()

labels_df = spark.table(FQ("labels_optional")).select("entity_id", "label").limit(50000)

feature_lookups = [
    FeatureLookup(
        table_name=FQ("feature_offline_current"),
        lookup_key="entity_id",
        feature_names=["activity_score_7d", "activity_score_30d", "txn_count_7d", "txn_amount_7d", "risk_score"],
    )
]

training_set = fe.create_training_set(
    df=labels_df,
    feature_lookups=feature_lookups,
    label="label",
    exclude_columns=["entity_id"],
)
training_pdf = training_set.load_df().toPandas()
log_step(f"training_set_loaded_shape={training_pdf.shape}")

# COMMAND ----------
# MAGIC %md ### 2. Train a minimal classifier and log it with feature lookups via `fe.log_model`

# COMMAND ----------
feature_cols = ["activity_score_7d", "activity_score_30d", "txn_count_7d", "txn_amount_7d", "risk_score"]
X = training_pdf[feature_cols].fillna(0)
y = training_pdf["label"]

clf = LogisticRegression(max_iter=200)
clf.fit(X, y)
log_step(f"model_trained_accuracy={clf.score(X, y)}")

mlflow.set_registry_uri("databricks-uc")
with mlflow.start_run(run_name="fscomp_churn_model"):
    model_info = fe.log_model(
        model=clf,
        artifact_path="model",
        flavor=mlflow.sklearn,
        training_set=training_set,
        registered_model_name=MODEL_NAME,
    )
log_step("model_logged_and_registered")

# COMMAND ----------
# MAGIC %md ### 3. Deploy a Model Serving endpoint with automatic feature lookup (scale-to-zero)

# COMMAND ----------
from mlflow.tracking import MlflowClient

client = MlflowClient()
versions = client.search_model_versions(f"name = '{MODEL_NAME}'")
latest_version = max(int(v.version) for v in versions)
log_step(f"latest_version={latest_version}")

# COMMAND ----------
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.serving import EndpointCoreConfigInput, ServedEntityInput

w = WorkspaceClient()

config = EndpointCoreConfigInput(
    name=ENDPOINT_NAME,
    served_entities=[
        ServedEntityInput(
            entity_name=MODEL_NAME,
            entity_version=str(latest_version),
            workload_size="Small",
            scale_to_zero_enabled=True,
        )
    ]
)

existing_endpoints = {e.name for e in w.serving_endpoints.list()}
log_step(f"endpoint_exists={ENDPOINT_NAME in existing_endpoints}")
if ENDPOINT_NAME in existing_endpoints:
    w.serving_endpoints.update_config_and_wait(name=ENDPOINT_NAME, served_entities=config.served_entities)
    log_step(f"updated_endpoint_{ENDPOINT_NAME}")
else:
    w.serving_endpoints.create_and_wait(name=ENDPOINT_NAME, config=config)
    log_step(f"created_endpoint_{ENDPOINT_NAME}")

# COMMAND ----------
log_step("nb02_setup_complete")
