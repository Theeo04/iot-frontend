# iot-frontend

Browser dashboard for the IoT platform: a React/SVG view of the
`sensor_readings` table populated by
[`iot-sqs-ingestor`](https://github.com/Theeo04/iot-sqs-ingestor) and scored by
[`iot-anomaly-detector`](https://github.com/Theeo04/iot-anomaly-detector).

```text
PostgreSQL  ──►  FastAPI (this repo, /api/*)  ──►  React dashboard (this repo, /)
                          ↑ both served by the same image
```

Browsers can't speak the Postgres wire protocol, so a small FastAPI backend
sits in front. It owns the SQL queries, exposes a tiny JSON API, and also
serves the static dashboard files. One image, one deployment.

## What's in the box

```
.
├── Dashboard.html              # entry HTML, loads React/Babel + .jsx files
├── data.jsx                    # fetches /api/* → window globals
├── bootstrap.jsx               # awaits loadData(), mounts <App />
├── app.jsx, panels.jsx, …      # unchanged visual layout
├── services/
│   └── api/
│       ├── Dockerfile          # python:3.12-slim, bundles static files
│       ├── requirements.txt    # fastapi, uvicorn, psycopg[binary]
│       └── app/main.py         # /api/health, /api/devices, /api/series, /api/alerts
├── k8s/
│   └── iot-frontend/
│       ├── deployment.yaml     # 1-replica Deployment, http probes on /api/health
│       └── service.yaml        # NodePort 30080
└── .github/workflows/
    └── docker-publish.yml      # build context = repo root, image = iot-frontend
```

## API

All endpoints return JSON. The frontend pulls from these on page load.

| Method · Path                              | Returns                                    |
| ------------------------------------------ | ------------------------------------------ |
| `GET /api/health`                          | `{status, postgres}`                       |
| `GET /api/devices`                         | One row per distinct `device`              |
| `GET /api/series?device=…&range=24h\|7d\|30d` | `[{t, temp, humidity}]`                 |
| `GET /api/alerts?limit=N`                  | Anomalies (rows with `anomaly_score > 0`)  |

Field mapping (`sensor_readings` → JSON):

| Schema column        | JSON field                       |
| -------------------- | -------------------------------- |
| `received_at`        | `t` (epoch ms) / `ts` / `lastSeenMs` |
| `temperature`        | `temp`                           |
| `humidity`           | `humidity`                       |
| `device`             | `device` / device `id` + `name`  |
| `anomaly_reason`     | `msg`, `rule`                    |
| `anomaly_score`      | drives `sev` (`crit`/`warn`/`ok`)|
| `uptime_ms`          | `uptimeH`                        |
| `processing_status`  | drives device `status`           |

Fields the schema doesn't have (`location`, `mcu`, `firmware`, `rssi`) come
back as `"—"` / `null` — the dashboard renders them as em-dashes.

## Connecting to PostgreSQL

The API reads its credentials from the **same Secret** the ingestor and the
detector use (`postgres-credentials` in the `iot` namespace) and the same
Service (`postgres:5432`). No new secrets, no new wiring.

| Variable            | Source                          |
| ------------------- | ------------------------------- |
| `POSTGRES_HOST`     | Deployment `env`                |
| `POSTGRES_PORT`     | Deployment `env`                |
| `POSTGRES_DB`       | `postgres-credentials` Secret   |
| `POSTGRES_USER`     | `postgres-credentials` Secret   |
| `POSTGRES_PASSWORD` | `postgres-credentials` Secret   |
| `STATIC_DIR`        | Set by the Dockerfile to `/app/static` |

## Run locally (no Docker)

The dashboard needs Postgres reachable on `localhost:5432`. The cleanest way
is to port-forward the in-cluster Postgres:

```bash
kubectl -n iot port-forward service/postgres 5432:5432 &
```

Then start the API with the static files served from the repo root:

```bash
cd services/api
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt

export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=iot
export POSTGRES_USER=iot
export POSTGRES_PASSWORD=changeme   # whatever's in your postgres-credentials Secret
export STATIC_DIR="$(pwd)/../.."    # points uvicorn at the repo root

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Open <http://localhost:8000/> — the dashboard loads, runs `loadData()`, and
populates the chart from real rows.

## Build the image

From the repo root (the Dockerfile expects repo-root context so it can pull
both Python and static files):

```bash
docker build -t iot-frontend:dev -f services/api/Dockerfile .
```

For k3s:

```bash
docker save iot-frontend:dev | sudo k3s ctr images import -
```

## Deploy to Kubernetes

`iot-postgresql` must already be applied (so the `iot` namespace, the
`postgres-credentials` Secret, and the `postgres` Service exist). Edit
`k8s/iot-frontend/deployment.yaml` and replace `<dockerhub-user>` with the
Docker Hub account configured for CI.

```bash
kubectl apply -f k8s/iot-frontend/deployment.yaml
kubectl apply -f k8s/iot-frontend/service.yaml

kubectl -n iot rollout status deployment/iot-frontend
```

Open the dashboard at `http://<any-k3s-node-ip>:30080/`.

## CI/CD — Docker Hub publishing

`.github/workflows/docker-publish.yml` builds the image on every push to
`main` that touches `services/api/**`, any top-level `*.html` or `*.jsx`, or
the workflow file itself; also on `v*.*.*` tags and manual dispatch. Multi-arch
(`linux/amd64` + `linux/arm64`). Same tagging scheme as the other repos:
`latest`, branch, `vX.Y.Z`, `sha-<short>`.

Same configuration needed on the GitHub repo:

| Kind     | Name                 | Value                                      |
| -------- | -------------------- | ------------------------------------------ |
| Variable | `DOCKERHUB_USERNAME` | Your Docker Hub username                   |
| Secret   | `DOCKERHUB_TOKEN`    | A Docker Hub access token with write scope |

Image will be published to `docker.io/<DOCKERHUB_USERNAME>/iot-frontend`.

## How the frontend fetches data

`data.jsx` used to generate 30 days of synthetic DHT22 telemetry with a
seeded RNG. It now exposes `loadData()`, which `fetch`es the three API
endpoints in parallel and assigns the results to `window.FULL_SERIES`,
`window.DEVICES`, `window.ALERTS`, and `window.NOW`. `bootstrap.jsx`
awaits `loadData()` and then mounts `<App />` — so the existing
`app.jsx`/`panels.jsx`/`charts.jsx` code is unchanged in shape, only its
data source is different.

If the API is unreachable, `bootstrap.jsx` renders an error panel in place
of the dashboard instead of crashing on undefined globals.

## Where this fits

```text
Raspberry Pi Pico 2 W → AWS IoT Core → SQS → sqs-ingestor → PostgreSQL
                                                                  ↓
                                                         anomaly-detector
                                                                  ↓
                                                       FastAPI ──► browser
                                                            ↑ this repo
```
