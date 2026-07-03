import os

CATALOG = os.getenv("FS_CATALOG", "ytcy_azure_east2classic_stable")
SCHEMA = os.getenv("FS_SCHEMA", "feature_store_comp")


def fq(name: str) -> str:
    return f"{CATALOG}.{SCHEMA}.{name}"


DATABRICKS_WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID", "9c8fac7a0b250221")

ONLINE_STORE_NAME = os.getenv("ONLINE_STORE_NAME", "fscomp-online-store")
ONLINE_STORE_CAPACITY = os.getenv("ONLINE_STORE_CAPACITY", "CU_1")

# Underlying Postgres object names for the two published online tables. These are set once
# the setup job has published the tables and we've inspected the resulting Postgres schema.
ONLINE_TABLE_CURRENT = os.getenv("ONLINE_TABLE_CURRENT", "online_feature_current")
ONLINE_TABLE_TIMESERIES = os.getenv("ONLINE_TABLE_TIMESERIES", "online_feature_timeseries")
ONLINE_PG_SCHEMA = os.getenv("ONLINE_PG_SCHEMA", SCHEMA)

SERVING_ENDPOINT_NAME = os.getenv("SERVING_ENDPOINT_NAME", "fscomp-churn-serving")

# Lakebase (Postgres) connection -- injected by the Databricks Apps "postgres" resource binding.
# No static password is provided; PGUSER is the app's service principal client ID and a fresh
# OAuth token must be generated per-connection via WorkspaceClient.postgres.generate_database_credential.
PGHOST = os.getenv("PGHOST")
PGPORT = os.getenv("PGPORT", "5432")
PGDATABASE = os.getenv("PGDATABASE", CATALOG)
PGUSER = os.getenv("PGUSER")
PGSSLMODE = os.getenv("PGSSLMODE", "require")
ONLINE_STORE_ENDPOINT = os.getenv(
    "ONLINE_STORE_ENDPOINT",
    f"projects/{ONLINE_STORE_NAME}/branches/production/endpoints/primary",
)

# CU-hour price used only for the "estimated cost" convenience figure shown in the UI, alongside
# the raw CU-hour number pulled from system.billing.usage. Adjust to your negotiated rate.
ASSUMED_USD_PER_CU_HOUR = float(os.getenv("ASSUMED_USD_PER_CU_HOUR", "0.111"))
