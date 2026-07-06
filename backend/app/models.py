from typing import Literal, Optional

from pydantic import BaseModel

ScenarioId = Literal["A", "B", "C", "D"]
AccessPattern = Literal["uniform", "hot", "cold", "skewed"]
KeySet = Literal["small", "medium", "large"]
PublishMode = Literal["TRIGGERED", "CONTINUOUS"]


class RunRequest(BaseModel):
    scenario_id: ScenarioId
    key_set: KeySet = "small"
    access_pattern: AccessPattern = "uniform"
    concurrency: int = 1
    batch_size: int = 1
    request_count: int = 100
    publish_mode: Optional[PublishMode] = None  # scenario B only; switches mode before measuring


class RunSummary(BaseModel):
    run_id: str
    scenario_id: ScenarioId
    status: Literal["pending", "running", "succeeded", "failed"]
    created_at: str
    error: Optional[str] = None


class RunDetail(RunSummary):
    config: RunRequest
    results: list[dict] = []
    consistency_summary: Optional[dict] = None
    cost: Optional[dict] = None
