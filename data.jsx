/* ============================================================
   Data layer — real DHT22 telemetry from the Postgres backend.

   Endpoints (served by services/api):
     GET /api/series?device=…&range=30d  → [{t, temp, humidity}]
     GET /api/devices                    → [device records]
     GET /api/alerts?limit=…             → [alert records]

   The previous version generated 30 days of synthetic data in the
   browser. We now fetch from the API. Helpers (clampSeries, stats,
   formatNum, dewPoint, etc.) and config (THRESHOLDS, COMFORT_ZONES)
   are unchanged — only the source of FULL_SERIES, DEVICES, ALERTS,
   NOW has been swapped.
   ============================================================ */

const API_BASE = window.API_BASE || '';

async function fetchJSON(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch all data the dashboard needs and assign to window globals.
 * Called once by bootstrap.jsx before ReactDOM.createRoot.
 */
async function loadData() {
  const [series, devices, alerts] = await Promise.all([
    fetchJSON('/api/series?range=30d'),
    fetchJSON('/api/devices'),
    fetchJSON('/api/alerts?limit=50'),
  ]);

  // NOW = timestamp of the most recent reading (fall back to wall-clock).
  const nowMs = series.length ? series[series.length - 1].t : Date.now();

  // The frontend's panels reference fields the schema doesn't have
  // (location, mcu, firmware, rssi, etc.). The API returns "—" / null
  // placeholders for those — we just pass them through.
  window.FULL_SERIES = series;
  window.DEVICES = devices.length ? devices : [{
    id: 'none', name: 'No devices', location: '—',
    status: 'pending',
  }];
  window.ALERTS = alerts;
  window.NOW = new Date(nowMs);
}

// Helpers ──────────────────────────────────────────────────────
function clampSeries(rangeKey) {
  if (!FULL_SERIES.length) return [];
  const last = FULL_SERIES[FULL_SERIES.length - 1].t;
  const windows = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  const cutoff = last - windows[rangeKey];
  return FULL_SERIES.filter(d => d.t >= cutoff);
}

function downsample(series, maxPoints) {
  if (series.length <= maxPoints) return series;
  const step = series.length / maxPoints;
  const out = [];
  for (let i = 0; i < maxPoints; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    const slice = series.slice(start, end);
    if (!slice.length) continue;
    let t = 0, te = 0, h = 0;
    for (const p of slice) { t += p.t; te += p.temp; h += p.humidity; }
    out.push({
      t: t / slice.length,
      temp: te / slice.length,
      humidity: h / slice.length,
    });
  }
  return out;
}

function stats(series, key) {
  if (!series.length) return { min: 0, max: 0, avg: 0 };
  let min = Infinity, max = -Infinity, sum = 0;
  for (const p of series) {
    const v = p[key];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, avg: sum / series.length };
}

function formatNum(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

function formatRelative(ts) {
  const diff = (NOW.getTime() - ts) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function formatClock(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDate(ts) {
  const d = new Date(ts);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateTime(ts) {
  return `${formatDate(ts)} ${formatClock(ts)}`;
}

function dewPoint(t, rh) {
  const a = 17.625, b = 243.04;
  const alpha = Math.log(rh / 100) + (a * t) / (b + t);
  return (b * alpha) / (a - alpha);
}

// Thresholds match the anomaly detector defaults (TEMP_MIN=0, TEMP_MAX=50,
// HUMIDITY_MIN=20, HUMIDITY_MAX=90). "lo/hi" are the comfort band shown on
// charts; "critLo/critHi" are the detector's hard thresholds.
const THRESHOLDS = {
  temp: { lo: 18, hi: 27, critLo: 0, critHi: 50 },
  humidity: { lo: 30, hi: 60, critLo: 20, critHi: 90 },
};

const COMFORT_ZONES = [
  { id: 'optimal', name: 'Optimal',     t: [20, 25], h: [40, 55], color: 'oklch(0.74 0.14 155)' },
  { id: 'accept',  name: 'Acceptable',  t: [18, 27], h: [30, 60], color: 'oklch(0.78 0.14 80)' },
  { id: 'risk',    name: 'At risk',     t: [15, 30], h: [20, 70], color: 'oklch(0.68 0.18 28)' },
];

Object.assign(window, {
  loadData, clampSeries, downsample, stats,
  formatNum, formatRelative, formatClock, formatDate, formatDateTime,
  dewPoint, THRESHOLDS, COMFORT_ZONES,
});
