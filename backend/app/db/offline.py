"""Offline path: query UC Delta feature tables through the SQL warehouse."""
import contextlib
import os
import time
from typing import Any

from databricks import sql
from databricks.sdk.core import Config

from app import config


def _cfg() -> Config:
    profile = os.getenv("DATABRICKS_CONFIG_PROFILE")
    return Config(profile=profile) if profile else Config()


def open_connection():
    cfg = _cfg()
    return sql.connect(
        server_hostname=cfg.host.replace("https://", "").replace("http://", ""),
        http_path=f"/sql/1.0/warehouses/{config.DATABRICKS_WAREHOUSE_ID}",
        credentials_provider=lambda: cfg.authenticate,
    )


@contextlib.contextmanager
def offline_connection():
    conn = open_connection()
    try:
        yield conn
    finally:
        conn.close()


def lookup_current(conn, entity_ids: list[str]) -> tuple[list[dict[str, Any]], float]:
    """Fetch latest-value features for a batch of entity_ids. Returns (rows, latency_ms)."""
    placeholders = ",".join("?" for _ in entity_ids)
    query = (
        f"SELECT entity_id, feature_updated_at, activity_score_7d, activity_score_30d, "
        f"txn_count_7d, txn_amount_7d, risk_score, segment "
        f"FROM {config.fq('feature_offline_current')} WHERE entity_id IN ({placeholders})"
    )
    start = time.perf_counter()
    with conn.cursor() as cur:
        cur.execute(query, entity_ids)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]
    latency_ms = (time.perf_counter() - start) * 1000
    return rows, latency_ms


def execute(conn, statement: str, params: list[Any] | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(statement, params or [])


def fetch_all(conn, statement: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(statement, params or [])
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
