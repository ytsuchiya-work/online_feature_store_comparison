"""Trigger the publish-mode-toggle notebook as a one-off job run. Publishing requires a
Spark session, which the Apps container does not have, so this is delegated to a job."""
import os
import time

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.jobs import NotebookTask, SubmitTask

from app import config

NOTEBOOK_PATH = os.getenv(
    "TOGGLE_PUBLISH_NOTEBOOK_PATH",
    "/Users/yusuke.tsuchiya@databricks.com/online_feature_store_comparison/notebooks/03_toggle_publish",
)


def _client() -> WorkspaceClient:
    profile = os.getenv("DATABRICKS_CONFIG_PROFILE")
    return WorkspaceClient(profile=profile) if profile else WorkspaceClient()


def set_publish_mode(source_table: str, online_table: str, mode: str, timeout_sec: int = 900) -> None:
    w = _client()
    run = w.jobs.submit(
        run_name=f"fscomp-toggle-publish-{mode}",
        tasks=[
            SubmitTask(
                task_key="toggle_publish",
                notebook_task=NotebookTask(
                    notebook_path=NOTEBOOK_PATH,
                    base_parameters={
                        "source_table": source_table,
                        "online_table": online_table,
                        "mode": mode,
                        "online_store_name": config.ONLINE_STORE_NAME,
                    },
                ),
            )
        ],
    )
    run_id = run.response.run_id if hasattr(run, "response") else run.run_id
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        status = w.jobs.get_run(run_id)
        state = status.state
        if state and state.life_cycle_state and str(state.life_cycle_state).endswith("TERMINATED"):
            if str(state.result_state) != "RunResultState.SUCCESS" and state.result_state is not None:
                raise RuntimeError(f"publish mode toggle job failed: {state.state_message}")
            return
        time.sleep(10)
    raise TimeoutError("Timed out waiting for publish mode toggle job")
