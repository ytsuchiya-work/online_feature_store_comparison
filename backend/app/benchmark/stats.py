import math
from typing import Any


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * pct
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return s[int(k)]
    return s[f] + (s[c] - s[f]) * (k - f)


def summarize(records: list[dict[str, Any]], duration_sec: float) -> dict[str, Any]:
    latencies = [r["latency_ms"] for r in records if r["success"]]
    total = len(records)
    errors = sum(1 for r in records if not r["success"])
    return {
        "p50_ms": round(percentile(latencies, 0.50), 3),
        "p95_ms": round(percentile(latencies, 0.95), 3),
        "p99_ms": round(percentile(latencies, 0.99), 3),
        "qps": round(total / duration_sec, 3) if duration_sec > 0 else 0.0,
        "error_rate": round(errors / total, 4) if total else 0.0,
        "request_count": total,
    }
