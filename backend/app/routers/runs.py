from fastapi import APIRouter, HTTPException

from app import state
from app.models import RunRequest

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.post("")
def create_run(req: RunRequest):
    run_id = state.start_run(req)
    return {"run_id": run_id}


@router.get("")
def list_runs():
    return state.list_runs()


@router.get("/{run_id}")
def get_run(run_id: str):
    run = state.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    return run
