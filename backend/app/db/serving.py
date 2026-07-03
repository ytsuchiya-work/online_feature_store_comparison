"""Scenario E: call the Model Serving endpoint with automatic feature lookup enabled."""
import os
import time

import requests
from databricks.sdk.core import Config

from app import config


def _cfg() -> Config:
    profile = os.getenv("DATABRICKS_CONFIG_PROFILE")
    return Config(profile=profile) if profile else Config()


def score_entity(entity_id: str) -> tuple[dict | None, float, str | None]:
    """Send only the entity_id -- the endpoint auto-looks-up the rest of the features.
    Returns (response_json, latency_ms, error)."""
    cfg = _cfg()
    headers = cfg.authenticate()
    headers["Content-Type"] = "application/json"
    url = f"{cfg.host}/serving-endpoints/{config.SERVING_ENDPOINT_NAME}/invocations"
    payload = {"dataframe_records": [{"entity_id": entity_id}]}

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
