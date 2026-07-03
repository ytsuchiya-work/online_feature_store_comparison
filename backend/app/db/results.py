"""Persist benchmark run metadata/results into the UC result tables via the SQL warehouse."""
from typing import Any

from app import config
from app.db.offline import execute


def insert_scenario(conn, run: dict[str, Any]) -> None:
    execute(
        conn,
        f"""INSERT INTO {config.fq('benchmark_scenarios')}
            (run_id, scenario_id, scenario_name, access_pattern, concurrency, batch_size,
             publish_mode, feature_set, key_set, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp())""",
        [
            run["run_id"], run["scenario_id"], run["scenario_name"], run["access_pattern"],
            run["concurrency"], run["batch_size"], run["publish_mode"], run["feature_set"],
            run["key_set"],
        ],
    )


def insert_requests(conn, run_id: str, records: list[dict[str, Any]]) -> None:
    if not records:
        return
    stmt = f"""INSERT INTO {config.fq('benchmark_requests')}
        (run_id, request_id, entity_id, request_ts, source_type, latency_ms, success, error_message)
        VALUES (?, ?, ?, current_timestamp(), ?, ?, ?, ?)"""
    with conn.cursor() as cur:
        cur.executemany(
            stmt,
            [
                [run_id, r["request_id"], r["entity_id"], r["source_type"], r["latency_ms"],
                 r["success"], r.get("error_message")]
                for r in records
            ],
        )


def insert_result(conn, run_id: str, source_type: str, stats: dict[str, Any]) -> None:
    execute(
        conn,
        f"""INSERT INTO {config.fq('benchmark_results')}
            (run_id, source_type, p50_ms, p95_ms, p99_ms, qps, error_rate, freshness_lag_ms,
             request_count, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp())""",
        [
            run_id, source_type, stats["p50_ms"], stats["p95_ms"], stats["p99_ms"],
            stats["qps"], stats["error_rate"], stats.get("freshness_lag_ms"),
            stats["request_count"],
        ],
    )


def insert_consistency(conn, run_id: str, records: list[dict[str, Any]]) -> None:
    if not records:
        return
    stmt = f"""INSERT INTO {config.fq('value_consistency_results')}
        (run_id, entity_id, feature_name, offline_value, online_value, is_match, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, current_timestamp())"""
    with conn.cursor() as cur:
        cur.executemany(
            stmt,
            [
                [run_id, r["entity_id"], r["feature_name"], r["offline_value"],
                 r["online_value"], r["is_match"]]
                for r in records
            ],
        )


def insert_cost_snapshot(conn, run_id: str, capacity: str, elapsed_sec: float,
                          estimated_cu_hours: float | None, window_start: str, window_end: str) -> None:
    execute(
        conn,
        f"""INSERT INTO {config.fq('cost_snapshots')}
            (run_id, online_store_capacity, elapsed_sec, estimated_cu_hours, window_start,
             window_end, created_at)
            VALUES (?, ?, ?, ?, ?, ?, current_timestamp())""",
        [run_id, capacity, elapsed_sec, estimated_cu_hours, window_start, window_end],
    )
