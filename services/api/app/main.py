import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "postgres")
POSTGRES_PORT = int(os.environ.get("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.environ.get("POSTGRES_DB", "iot")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "iot")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "")

STATIC_DIR = Path(os.environ.get("STATIC_DIR", "/app/static")).resolve()

RANGE_TO_INTERVAL = {
    "24h": "24 hours",
    "7d": "7 days",
    "30d": "30 days",
}

POOL: ConnectionPool | None = None


def conninfo() -> str:
    return (
        f"host={POSTGRES_HOST} port={POSTGRES_PORT} "
        f"dbname={POSTGRES_DB} user={POSTGRES_USER} password={POSTGRES_PASSWORD}"
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    global POOL
    POOL = ConnectionPool(
        conninfo(),
        min_size=1,
        max_size=4,
        kwargs={"row_factory": dict_row},
        open=True,
    )
    try:
        yield
    finally:
        POOL.close()


app = FastAPI(title="iot-frontend API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def status_from_score(score: float | None, reason: str | None) -> str:
    if score is None:
        return "pending"
    if score >= 1.0:
        return "crit"
    if score > 0.0:
        return "warn"
    return "ok"


def severity_from_score(score: float) -> str:
    if score >= 1.0:
        return "crit"
    if score > 0.0:
        return "warn"
    return "ok"


@app.get("/api/health")
def health() -> dict[str, Any]:
    if POOL is None:
        return {"status": "starting"}
    try:
        with POOL.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1;")
            cur.fetchone()
        return {"status": "ok", "postgres": "reachable"}
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "postgres": "unreachable", "error": str(exc)},
        )


@app.get("/api/devices")
def list_devices() -> list[dict[str, Any]]:
    sql = """
        WITH latest AS (
            SELECT DISTINCT ON (device)
                   device,
                   received_at,
                   temperature,
                   humidity,
                   uptime_ms,
                   processing_status,
                   anomaly_score,
                   anomaly_reason
            FROM sensor_readings
            ORDER BY device, received_at DESC
        )
        SELECT * FROM latest ORDER BY device ASC;
    """
    with POOL.connection() as conn, conn.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    devices = []
    for r in rows:
        score = r["anomaly_score"] if r["processing_status"] == "processed" else None
        last_seen_ms = int(r["received_at"].timestamp() * 1000)
        uptime_h = int((r["uptime_ms"] or 0) / 3_600_000)
        devices.append(
            {
                "id": r["device"],
                "name": r["device"],
                "location": "—",
                "mcu": "—",
                "firmware": "—",
                "rssi": None,
                "battery": None,
                "poweredBy": "—",
                "sampleRate": "—",
                "uptimeH": uptime_h,
                "lastSeenMs": last_seen_ms,
                "status": status_from_score(score, r["anomaly_reason"]),
                "latest": {
                    "temperature": float(r["temperature"]),
                    "humidity": float(r["humidity"]),
                },
            }
        )
    return devices


@app.get("/api/series")
def series(
    device: str | None = Query(default=None),
    range: str = Query(default="30d", pattern="^(24h|7d|30d)$"),
) -> list[dict[str, Any]]:
    interval = RANGE_TO_INTERVAL[range]

    if device is None:
        with POOL.connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT device FROM sensor_readings "
                "ORDER BY received_at DESC LIMIT 1;"
            )
            row = cur.fetchone()
            if row is None:
                return []
            device = row["device"]

    sql = f"""
        SELECT received_at, temperature, humidity
        FROM sensor_readings
        WHERE device = %(device)s
          AND received_at >= now() - INTERVAL '{interval}'
        ORDER BY received_at ASC;
    """
    with POOL.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, {"device": device})
        rows = cur.fetchall()

    return [
        {
            "t": int(r["received_at"].timestamp() * 1000),
            "temp": float(r["temperature"]),
            "humidity": float(r["humidity"]),
        }
        for r in rows
    ]


@app.get("/api/alerts")
def alerts(limit: int = Query(default=20, ge=1, le=200)) -> list[dict[str, Any]]:
    sql = """
        SELECT id, device, received_at, processed_at,
               anomaly_score, anomaly_reason
        FROM sensor_readings
        WHERE processing_status = 'processed'
          AND anomaly_score IS NOT NULL
          AND anomaly_score > 0
        ORDER BY received_at DESC
        LIMIT %(limit)s;
    """
    with POOL.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, {"limit": limit})
        rows = cur.fetchall()

    out = []
    for r in rows:
        sev = severity_from_score(float(r["anomaly_score"]))
        out.append(
            {
                "id": f"a-{r['id']}",
                "sev": sev,
                "unack": True,
                "msg": r["anomaly_reason"] or "anomaly detected",
                "device": r["device"],
                "rule": r["anomaly_reason"] or "—",
                "ts": int(r["received_at"].timestamp() * 1000),
            }
        )
    return out


# Serve the static frontend.
if STATIC_DIR.exists():
    @app.get("/")
    def index() -> FileResponse:
        index_html = STATIC_DIR / "Dashboard.html"
        if not index_html.exists():
            raise HTTPException(status_code=404, detail="Dashboard.html not found")
        return FileResponse(index_html)

    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=False), name="static")
