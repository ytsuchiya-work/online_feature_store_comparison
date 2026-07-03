"""Estimate CU-hours actually billed for a run's time window using system.billing.usage,
falling back to a capacity-based estimate when no billing rows are available yet (billing
usage tables are typically populated with some delay)."""
from datetime import datetime, timedelta
from typing import Any

from app import config
from app.db.offline import fetch_all


def estimate_cu_hours(conn, window_start: datetime, window_end: datetime, capacity: str) -> dict[str, Any]:
    elapsed_sec = max((window_end - window_start).total_seconds(), 0.0)
    try:
        rows = fetch_all(
            conn,
            """SELECT sum(usage_quantity) AS cu_hours
               FROM system.billing.usage
               WHERE sku_name LIKE '%LAKEBASE%'
                 AND usage_start_time < ? AND usage_end_time > ?""",
            [window_end.isoformat(), window_start.isoformat()],
        )
        billed = rows[0]["cu_hours"] if rows and rows[0]["cu_hours"] is not None else None
    except Exception:
        billed = None

    if billed is not None:
        return {"estimated_cu_hours": float(billed), "source": "system.billing.usage"}

    capacity_cu = {"CU_1": 1, "CU_2": 2, "CU_4": 4, "CU_8": 8}.get(capacity, 1)
    approx = capacity_cu * elapsed_sec / 3600.0
    return {"estimated_cu_hours": round(approx, 6), "source": "capacity_approximation"}


def extrapolate(measured_qps: float, measured_cu_hours_per_1k: float) -> dict[str, int | float]:
    """Rough linear extrapolation of cost for 10k/100k/1M lookups from a measured sample."""
    return {
        n: round(measured_cu_hours_per_1k * (n / 1000), 6)
        for n in (10_000, 100_000, 1_000_000)
    }
