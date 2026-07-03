import random
from typing import Any

from app import config
from app.db.offline import fetch_all

KEY_SET_TABLES = {
    "small": "lookup_keys_small",
    "medium": "lookup_keys_medium",
    "large": "lookup_keys_large",
}


def load_candidate_pool(conn, key_set: str, pool_size: int = 2000) -> list[str]:
    table = config.fq(KEY_SET_TABLES[key_set])
    rows = fetch_all(conn, f"SELECT entity_id FROM {table} TABLESAMPLE ({pool_size} ROWS)")
    ids = [r["entity_id"] for r in rows]
    if not ids:
        rows = fetch_all(conn, f"SELECT entity_id FROM {table} LIMIT {pool_size}")
        ids = [r["entity_id"] for r in rows]
    return ids


def sample_entity_ids(pool: list[str], access_pattern: str, n: int) -> list[str]:
    if not pool:
        return []
    if access_pattern == "hot":
        key = random.choice(pool)
        return [key] * n
    if access_pattern == "cold":
        return [pool[i % len(pool)] for i in range(n)]
    if access_pattern == "skewed":
        hot_pool = pool[: max(1, len(pool) // 5)]  # top 20%
        out = []
        for _ in range(n):
            out.append(random.choice(hot_pool) if random.random() < 0.8 else random.choice(pool))
        return out
    # uniform
    return [random.choice(pool) for _ in range(n)]


def batches(seq: list[Any], size: int):
    for i in range(0, len(seq), size):
        yield seq[i : i + size]
