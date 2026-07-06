import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from app import config
from app.benchmark import cost, sampling, stats
from app.db import jobs, offline, online, results
from app.db.offline import offline_connection
from app.db.serving import score_entity
from app.models import RunRequest

_thread_local = threading.local()


def _thread_offline_conn():
    conn = getattr(_thread_local, "conn", None)
    if conn is None:
        conn = offline.open_connection()
        _thread_local.conn = conn
    return conn


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_latest_value_scenario(run_id: str, cfg: RunRequest, admin_conn) -> dict:
    """Scenario A / C: single or batched latest-value lookup, offline vs online."""
    pool = sampling.load_candidate_pool(admin_conn, cfg.key_set)
    entity_ids = sampling.sample_entity_ids(pool, cfg.access_pattern, cfg.request_count)
    batch_list = list(sampling.batches(entity_ids, max(cfg.batch_size, 1)))

    offline_records: list[dict] = []
    online_records: list[dict] = []
    consistency_records: list[dict] = []
    lock = threading.Lock()

    def run_batch(batch: list[str]):
        req_id = str(uuid.uuid4())
        try:
            oconn = _thread_offline_conn()
            off_rows, off_ms = offline.lookup_current(oconn, batch)
            off_ok, off_err = True, None
        except Exception as e:  # noqa: BLE001
            off_rows, off_ms, off_ok, off_err = [], 0.0, False, str(e)
        try:
            on_rows, on_ms = online.lookup_current(batch)
            on_ok, on_err = True, None
        except Exception as e:  # noqa: BLE001
            on_rows, on_ms, on_ok, on_err = [], 0.0, False, str(e)

        with lock:
            offline_records.append({"request_id": req_id, "entity_id": batch[0], "source_type": "offline",
                                     "latency_ms": off_ms, "success": off_ok, "error_message": off_err})
            online_records.append({"request_id": req_id, "entity_id": batch[0], "source_type": "online",
                                    "latency_ms": on_ms, "success": on_ok, "error_message": on_err})
            off_by_id = {r["entity_id"]: r for r in off_rows}
            on_by_id = {r["entity_id"]: r for r in on_rows}
            for eid in set(off_by_id) & set(on_by_id):
                for feature in ("activity_score_7d", "risk_score"):
                    ov = off_by_id[eid].get(feature)
                    nv = on_by_id[eid].get(feature)
                    consistency_records.append({
                        "entity_id": eid, "feature_name": feature,
                        "offline_value": str(ov), "online_value": str(nv), "is_match": str(ov) == str(nv),
                    })

    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=max(cfg.concurrency, 1)) as pool_exec:
        futures = [pool_exec.submit(run_batch, b) for b in batch_list]
        for f in as_completed(futures):
            f.result()
    duration_sec = time.perf_counter() - start

    results.insert_requests(admin_conn, run_id, offline_records)
    results.insert_requests(admin_conn, run_id, online_records)
    off_stats = stats.summarize(offline_records, duration_sec)
    on_stats = stats.summarize(online_records, duration_sec)
    results.insert_result(admin_conn, run_id, "offline", off_stats)
    results.insert_result(admin_conn, run_id, "online", on_stats)
    results.insert_consistency(admin_conn, run_id, consistency_records)
    admin_conn.commit() if hasattr(admin_conn, "commit") else None
    return {"offline": off_stats, "online": on_stats, "duration_sec": duration_sec}


def run_freshness_scenario(run_id: str, cfg: RunRequest, admin_conn) -> dict:
    """Scenario B: measure publish -> visible-online lag, optionally after switching publish mode."""
    if cfg.publish_mode:
        jobs.set_publish_mode(
            source_table=config.fq("feature_offline_current"),
            online_table=config.fq("online_feature_current"),
            mode=cfg.publish_mode,
        )

    pool = sampling.load_candidate_pool(admin_conn, cfg.key_set, pool_size=200)
    entity_ids = sampling.sample_entity_ids(pool, "uniform", min(cfg.request_count, 20))

    lag_records = []
    online_records = []
    for entity_id in entity_ids:
        before_rows, _ = online.lookup_current([entity_id])
        before_val = before_rows[0]["risk_score"] if before_rows else None

        write_ts = time.perf_counter()
        offline.execute(
            admin_conn,
            f"UPDATE {config.fq('feature_offline_current')} SET risk_score = risk_score + 0.0001, "
            f"feature_updated_at = current_timestamp() WHERE entity_id = ?",
            [entity_id],
        )

        deadline = write_ts + 120
        observed_ms = None
        while time.perf_counter() < deadline:
            rows, read_ms = online.lookup_current([entity_id])
            online_records.append({"request_id": str(uuid.uuid4()), "entity_id": entity_id,
                                    "source_type": "online", "latency_ms": read_ms, "success": True,
                                    "error_message": None})
            new_val = rows[0]["risk_score"] if rows else None
            if new_val is not None and new_val != before_val:
                observed_ms = (time.perf_counter() - write_ts) * 1000
                break
            time.sleep(1)
        lag_records.append(observed_ms if observed_ms is not None else (time.perf_counter() - write_ts) * 1000)

    results.insert_requests(admin_conn, run_id, online_records)
    avg_lag = sum(lag_records) / len(lag_records) if lag_records else None
    on_stats = stats.summarize(online_records, sum(r["latency_ms"] for r in online_records) / 1000 or 1.0)
    on_stats["freshness_lag_ms"] = avg_lag
    results.insert_result(admin_conn, run_id, "online", on_stats)
    return {"online": on_stats, "avg_freshness_lag_ms": avg_lag, "publish_mode": cfg.publish_mode or "unchanged"}


MODEL_FEATURE_COLS = ["activity_score_7d", "activity_score_30d", "txn_count_7d", "txn_amount_7d", "risk_score"]


def run_serving_scenario(run_id: str, cfg: RunRequest, admin_conn) -> dict:
    """Scenario D: single-row realtime inference, offline vs online feature path.

    Both paths score on the same Model Serving endpoint, so the model and scoring infra
    are identical -- only the feature retrieval differs:
    - offline_scoring: fetch the feature row from the offline Delta table via SQL warehouse,
      then send the values to the endpoint (providing features skips the online lookup).
      This deliberately misuses the batch-oriented offline path for row-by-row inference.
    - serving: send only the entity_id; the endpoint auto-looks-up features from the
      Lakebase online store (the intended realtime path).
    """
    pool = sampling.load_candidate_pool(admin_conn, cfg.key_set)
    entity_ids = sampling.sample_entity_ids(pool, cfg.access_pattern, cfg.request_count)

    offline_records: list[dict] = []
    serving_records: list[dict] = []
    lock = threading.Lock()

    def run_one(entity_id: str):
        req_id = str(uuid.uuid4())

        off_start = time.perf_counter()
        try:
            oconn = _thread_offline_conn()
            rows, _ = offline.lookup_current(oconn, [entity_id])
            if not rows:
                raise RuntimeError(f"entity {entity_id} not found in offline feature table")
            features = {col: float(rows[0][col]) if rows[0][col] is not None else 0.0
                        for col in MODEL_FEATURE_COLS}
            off_resp, _, off_err = score_entity(entity_id, features=features)
            off_ok = off_resp is not None and off_err is None
        except Exception as e:  # noqa: BLE001
            off_ok, off_err = False, str(e)
        off_ms = (time.perf_counter() - off_start) * 1000

        on_resp, on_ms, on_err = score_entity(entity_id)

        with lock:
            offline_records.append({"request_id": req_id, "entity_id": entity_id, "source_type": "offline_scoring",
                                     "latency_ms": off_ms, "success": off_ok, "error_message": off_err})
            serving_records.append({"request_id": req_id, "entity_id": entity_id, "source_type": "serving",
                                     "latency_ms": on_ms, "success": on_resp is not None, "error_message": on_err})

    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=max(cfg.concurrency, 1)) as pool_exec:
        futures = [pool_exec.submit(run_one, eid) for eid in entity_ids]
        for f in as_completed(futures):
            f.result()
    duration_sec = time.perf_counter() - start

    results.insert_requests(admin_conn, run_id, offline_records)
    results.insert_requests(admin_conn, run_id, serving_records)
    offline_stats = stats.summarize(offline_records, duration_sec)
    serving_stats = stats.summarize(serving_records, duration_sec)
    results.insert_result(admin_conn, run_id, "offline_scoring", offline_stats)
    results.insert_result(admin_conn, run_id, "serving", serving_stats)
    gap_ms = offline_stats["p50_ms"] - serving_stats["p50_ms"]
    return {"offline_scoring": offline_stats, "serving": serving_stats, "offline_vs_online_p50_ms": gap_ms}


SCENARIO_RUNNERS = {
    "A": run_latest_value_scenario,
    "B": run_freshness_scenario,
    "C": run_latest_value_scenario,
    "D": run_serving_scenario,
}

SCENARIO_NAMES = {
    "A": "latest_value_lookup",
    "B": "freshness",
    "C": "concurrency_load",
    "D": "single_row_inference_offline_vs_online",
}


def execute_run(run_id: str, cfg: RunRequest) -> dict:
    window_start = datetime.now(timezone.utc)
    with offline_connection() as admin_conn:
        results.insert_scenario(admin_conn, {
            "run_id": run_id, "scenario_id": cfg.scenario_id, "scenario_name": SCENARIO_NAMES[cfg.scenario_id],
            "access_pattern": cfg.access_pattern, "concurrency": cfg.concurrency, "batch_size": cfg.batch_size,
            "publish_mode": cfg.publish_mode, "feature_set": "current", "key_set": cfg.key_set,
        })
        runner_fn = SCENARIO_RUNNERS[cfg.scenario_id]
        outcome = runner_fn(run_id, cfg, admin_conn)

        window_end = datetime.now(timezone.utc)
        cost_info = cost.estimate_cu_hours(admin_conn, window_start, window_end, config.ONLINE_STORE_CAPACITY)
        results.insert_cost_snapshot(
            admin_conn, run_id, config.ONLINE_STORE_CAPACITY,
            (window_end - window_start).total_seconds(), cost_info["estimated_cu_hours"],
            window_start.isoformat(), window_end.isoformat(),
        )
        outcome["cost"] = cost_info
    return outcome
