import threading
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any

from app.benchmark.runner import execute_run
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


def get_run(run_id: str) -> dict[str, Any] | None:
    with _lock:
        return dict(_runs[run_id]) if run_id in _runs else None


def list_runs() -> list[dict[str, Any]]:
    with _lock:
        return sorted(_runs.values(), key=lambda r: r["created_at"], reverse=True)
