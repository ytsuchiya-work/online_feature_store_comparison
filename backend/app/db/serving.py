"""Scenario D: call the Model Serving endpoint, with or without automatic feature lookup."""
import os
import time
from typing import Any

import requests
from databricks.sdk.core import Config

from app import config


def _cfg() -> Config:
    profile = os.getenv("DATABRICKS_CONFIG_PROFILE")
    return Config(profile=profile) if profile else Config()


def score_entity(entity_id: str, features: dict[str, Any] | None = None) -> tuple[dict | None, float, str | None]:
    """Score one entity on the serving endpoint.

    Without `features`, only the entity_id is sent and the endpoint auto-looks-up the
    feature values from the online store (the online realtime-inference path).
    With `features`, the provided values are sent in the request; the endpoint then skips
    the online lookup and uses them as-is, so the same model/scoring infra can be driven
    by features fetched from the offline store. Returns (response_json, latency_ms, error).
    """
    cfg = _cfg()
    headers = cfg.authenticate()
    headers["Content-Type"] = "application/json"
    url = f"{cfg.host}/serving-endpoints/{config.SERVING_ENDPOINT_NAME}/invocations"
    record: dict[str, Any] = {"entity_id": entity_id, **(features or {})}
    payload = {"dataframe_records": [record]}

    start = time.perf_counter()
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        latency_ms = (time.perf_counter() - start) * 1000
        if resp.status_code != 200:
            return None, latency_ms, f"HTTP {resp.status_code}: {resp.text[:300]}"
        return resp.json(), latency_ms, None
    except requests.RequestException as e:
        latency_ms = (time.perf_counter() - start) * 1000
        return None, latency_ms, str(e)
