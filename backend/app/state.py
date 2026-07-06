import threading
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any

from app.benchmark.runner import execute_run
from app.db import results as results_db
from app.db.offline import offline_connection
from app.models import RunRequest

_runs: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def start_run(cfg: RunRequest) -> str:
    run_id = str(uuid.uuid4())
    with _lock:
        _runs[run_id] = {
            "run_id": run_id,
            "scenario_id": cfg.scenario_id,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "config": cfg.model_dump(),
            "outcome": None,
            "error": None,
        }

    def _worker():
        with _lock:
            _runs[run_id]["status"] = "running"
        try:
            outcome = execute_run(run_id, cfg)
            with _lock:
                _runs[run_id]["status"] = "succeeded"
                _runs[run_id]["outcome"] = outcome
        except Exception as e:  # noqa: BLE001
            with _lock:
                _runs[run_id]["status"] = "failed"
                _runs[run_id]["error"] = f"{e}\n{traceback.format_exc()}"

    threading.Thread(target=_worker, daemon=True).start()
    return run_id


def _isoformat(value: Any) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _summary_from_persisted(scenario_row: dict[str, Any], result_rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Reconstruct the same shape start_run's in-memory outcome produces, from the durable UC
    tables -- so run history and detail survive app restarts/redeploys, not just this process."""
    outcome: dict[str, Any] = {
        r["source_type"]: {
            "p50_ms": r["p50_ms"], "p95_ms": r["p95_ms"], "p99_ms": r["p99_ms"],
            "qps": r["qps"], "error_rate": r["error_rate"], "request_count": r["request_count"],
        }
        for r in result_rows
    }
    freshness_row = next((r for r in result_rows if r.get("freshness_lag_ms") is not None), None)
    if freshness_row is not None:
        outcome["avg_freshness_lag_ms"] = freshness_row["freshness_lag_ms"]
        outcome["publish_mode"] = scenario_row.get("publish_mode") or "unchanged"
    if "offline_scoring" in outcome and "serving" in outcome:
        outcome["offline_vs_online_p50_ms"] = outcome["offline_scoring"]["p50_ms"] - outcome["serving"]["p50_ms"]
    elif "serving" in outcome and "online" in outcome:
        # Legacy scenario D/E runs: serving (auto lookup) vs raw online lookup.
        outcome["lookup_overhead_p50_ms"] = outcome["serving"]["p50_ms"] - outcome["online"]["p50_ms"]

    request_count = result_rows[0]["request_count"] if result_rows else 0
    return {
        "run_id": scenario_row["run_id"],
        "scenario_id": scenario_row["scenario_id"],
        "status": "succeeded" if result_rows else "failed",
        "created_at": _isoformat(scenario_row["created_at"]),
        "config": {
            "scenario_id": scenario_row["scenario_id"],
            "key_set": scenario_row["key_set"],
            "access_pattern": scenario_row["access_pattern"],
            "concurrency": scenario_row["concurrency"],
            "batch_size": scenario_row["batch_size"],
            "request_count": request_count,
            "publish_mode": scenario_row.get("publish_mode"),
        },
        "outcome": outcome,
        "error": None if result_rows else "No persisted results found for this run (it may have failed in a previous app instance).",
    }


def get_run(run_id: str) -> dict[str, Any] | None:
    with _lock:
        live = dict(_runs[run_id]) if run_id in _runs else None
    if live is not None:
        return live
    with offline_connection() as conn:
        scenario_row = results_db.fetch_scenario(conn, run_id)
        if scenario_row is None:
            return None
        result_rows = results_db.fetch_results_for_run(conn, run_id)
    return _summary_from_persisted(scenario_row, result_rows)


def list_runs() -> list[dict[str, Any]]:
    with _lock:
        live_by_id = {run_id: dict(r) for run_id, r in _runs.items()}

    with offline_connection() as conn:
        scenario_rows = results_db.list_scenarios(conn)
        result_rows_by_run = results_db.results_by_run_ids(conn, [r["run_id"] for r in scenario_rows])

    merged: dict[str, dict[str, Any]] = {}
    for scenario_row in scenario_rows:
        run_id = scenario_row["run_id"]
        if run_id in live_by_id:
            merged[run_id] = live_by_id.pop(run_id)
        else:
            merged[run_id] = _summary_from_persisted(scenario_row, result_rows_by_run.get(run_id, []))
    # Runs still pending/running in this process may not have a persisted row yet.
    merged.update(live_by_id)

    return sorted(merged.values(), key=lambda r: r["created_at"], reverse=True)
