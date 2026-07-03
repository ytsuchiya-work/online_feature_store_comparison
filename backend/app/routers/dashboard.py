from fastapi import APIRouter

from app import config
from app.benchmark.cost import extrapolate
from app.db.offline import fetch_all, offline_connection

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/results")
def all_results(limit: int = 200):
    with offline_connection() as conn:
        return fetch_all(
            conn,
            f"""SELECT r.run_id, s.scenario_id, s.scenario_name, s.access_pattern, s.concurrency,
                       s.batch_size, s.publish_mode, s.key_set, s.created_at,
                       r.source_type, r.p50_ms, r.p95_ms, r.p99_ms, r.qps, r.error_rate,
                       r.freshness_lag_ms, r.request_count
                FROM {config.fq('benchmark_results')} r
                JOIN {config.fq('benchmark_scenarios')} s ON r.run_id = s.run_id
                ORDER BY s.created_at DESC
                LIMIT {int(limit)}""",
        )


@router.get("/consistency/{run_id}")
def consistency(run_id: str):
    with offline_connection() as conn:
        rows = fetch_all(
            conn,
            f"""SELECT feature_name,
                       count(*) AS total,
                       sum(CASE WHEN is_match THEN 1 ELSE 0 END) AS matched
                FROM {config.fq('value_consistency_results')}
                WHERE run_id = ?
                GROUP BY feature_name""",
            [run_id],
        )
    for r in rows:
        r["match_rate"] = (r["matched"] / r["total"]) if r["total"] else None
    return rows


@router.get("/cost/{run_id}")
def cost_for_run(run_id: str):
    with offline_connection() as conn:
        rows = fetch_all(
            conn,
            f"SELECT * FROM {config.fq('cost_snapshots')} WHERE run_id = ? ORDER BY created_at DESC LIMIT 1",
            [run_id],
        )
        results_rows = fetch_all(
            conn,
            f"SELECT source_type, qps, request_count FROM {config.fq('benchmark_results')} WHERE run_id = ?",
            [run_id],
        )
    if not rows:
        return {"run_id": run_id, "snapshot": None, "extrapolation": None}
    snapshot = rows[0]
    online_row = next((r for r in results_rows if r["source_type"] == "online"), None)
    extrapolation = None
    if online_row and online_row["request_count"]:
        cu_hours_per_1k = snapshot["estimated_cu_hours"] * (1000 / online_row["request_count"])
        extrapolation = extrapolate(online_row["qps"], cu_hours_per_1k)
    return {"run_id": run_id, "snapshot": snapshot, "extrapolation": extrapolation}
