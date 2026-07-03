from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.routers import dashboard, runs

app = FastAPI(title="Online Feature Store Comparison")

app.include_router(runs.router)
app.include_router(dashboard.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/debug/env")
def debug_env():
    from app import config
    return {
        "PGHOST": repr(config.PGHOST),
        "PGPORT": repr(config.PGPORT),
        "PGDATABASE": repr(config.PGDATABASE),
        "PGUSER": repr(config.PGUSER),
        "PGSSLMODE": repr(config.PGSSLMODE),
        "ONLINE_STORE_ENDPOINT": repr(config.ONLINE_STORE_ENDPOINT),
    }


STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
