"""Online path: query the Lakebase-backed online feature store directly via psycopg.

This intentionally bypasses the Feature Engineering client at read time so the measured
latency reflects the same "raw serving lookup" path a real-time application would use.

Lakebase Autoscaling projects authenticate over OAuth (no static password): each new
connection must carry a freshly generated database credential, per Databricks' documented
pattern for connecting a custom app to a Lakebase Autoscaling project.
"""
import os
import threading
import time
from typing import Any

import psycopg
import psycopg.rows
from databricks.sdk import WorkspaceClient
from psycopg_pool import ConnectionPool

from app import config

_pool: ConnectionPool | None = None
_pool_lock = threading.Lock()


def _workspace_client() -> WorkspaceClient:
    profile = os.getenv("DATABRICKS_CONFIG_PROFILE")
    return WorkspaceClient(profile=profile) if profile else WorkspaceClient()


class OAuthConnection(psycopg.Connection):
    @classmethod
    def connect(cls, conninfo: str = "", **kwargs):
        credential = _workspace_client().postgres.generate_database_credential(
            endpoint=config.ONLINE_STORE_ENDPOINT
        )
        kwargs["password"] = credential.token
        return super().connect(conninfo, **kwargs)


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                conninfo = (
                    f"dbname={config.PGDATABASE} user={config.PGUSER} host={config.PGHOST} "
                    f"port={config.PGPORT} sslmode={config.PGSSLMODE}"
                )
                pool = ConnectionPool(
                    conninfo=conninfo,
                    connection_class=OAuthConnection,
                    min_size=1,
                    max_size=20,
                    open=False,
                )
                pool.open(wait=True, timeout=30)
                _pool = pool
    return _pool


def resolve_table_name(cur, hint: str) -> str:
    """Find the actual Postgres table name for a published online feature table.

    Publish creates the table somewhere under the app's connected database; we search
    information_schema for a table whose name contains the offline table's base name,
    since the exact schema Feature Engineering publishes to is an implementation detail.
    """
    cur.execute(
        "SELECT table_schema, table_name FROM information_schema.tables "
        "WHERE table_name = %s OR table_name LIKE %s LIMIT 1",
        (hint, f"%{hint}%"),
    )
    row = cur.fetchone()
    if row is None:
        raise RuntimeError(f"Could not find published online table matching '{hint}'")
    return f'"{row["table_schema"]}"."{row["table_name"]}"'


def lookup_current(entity_ids: list[str]) -> tuple[list[dict[str, Any]], float]:
    pool = get_pool()
    with pool.connection() as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            table = resolve_table_name(cur, config.ONLINE_TABLE_CURRENT)
            start = time.perf_counter()
            cur.execute(f"SELECT * FROM {table} WHERE entity_id = ANY(%s)", (entity_ids,))
            rows = cur.fetchall()
            latency_ms = (time.perf_counter() - start) * 1000
    return rows, latency_ms


def lookup_timeseries_latest(entity_id: str) -> tuple[dict[str, Any] | None, float]:
    """The online store only ever holds the latest snapshot per primary key -- there is no
    as-of lookup online. Used to compare against the offline point-in-time value."""
    pool = get_pool()
    with pool.connection() as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            table = resolve_table_name(cur, config.ONLINE_TABLE_TIMESERIES)
            start = time.perf_counter()
            cur.execute(
                f"SELECT * FROM {table} WHERE entity_id = %s ORDER BY event_ts DESC LIMIT 1",
                (entity_id,),
            )
            row = cur.fetchone()
            latency_ms = (time.perf_counter() - start) * 1000
    return row, latency_ms
