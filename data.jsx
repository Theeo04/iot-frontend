/* ============================================================
   Data layer — DHT22 simulated telemetry
   DHT22 spec recap (for thesis context):
     - Temperature: -40..80°C, ±0.5°C, 0.1°C resolution
     - Humidity:    0..100% RH, ±2-5%, 0.1% resolution
     - Sample rate: 0.5 Hz max (one read every 2s)
   We simulate a server-room sensor sampled every 5 min.
   ============================================================ */

// Seeded RNG so the dashboard is deterministic between reloads.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fix "now" so generated data is stable across renders.
const NOW = new Date('2026-05-23T14:42:00');

/**
 * Generate a long timeseries covering 30 days, 5-min cadence.
 * Returns array of { t (ms epoch), temp, humidity }.
 */
function generateSeries() {
  const rng = mulberry32(42);
  const stepMin = 5;
  const stepMs = stepMin * 60 * 1000;
  const totalMin = 30 * 24 * 60;
  const n = Math.floor(totalMin / stepMin);
  const out = [];

  // Drift baselines for slow seasonality (cooler nights, warmer days)
  let tempDrift = 0;
  let humDrift = 0;

  for (let i = 0; i < n; i++) {
    const t = NOW.getTime() - (n - i) * stepMs;
    const d = new Date(t);
    const hour = d.getHours() + d.getMinutes() / 60;

    // Diurnal cycle: cooler 03:00-06:00, warmer 14:00-17:00
    const diurnal = Math.sin(((hour - 9) / 24) * 2 * Math.PI);

    // Base temp ~ 22.4°C, swing ±1.2°C
    let temp = 22.4 + diurnal * 1.2 + tempDrift;
    // Humidity roughly inverse to temp + base 48%
    let hum = 48 - diurnal * 4 + humDrift;

    // Slow drift
    tempDrift += (rng() - 0.5) * 0.04;
    humDrift += (rng() - 0.5) * 0.15;
    tempDrift = Math.max(-1.2, Math.min(1.2, tempDrift));
    humDrift = Math.max(-3, Math.min(6, humDrift));

    // Measurement noise (DHT22 ±0.1 res, ±0.5 acc)
    temp += (rng() - 0.5) * 0.3;
    hum += (rng() - 0.5) * 1.0;

    // ── Humidity excursion in the last ~3 hours (drives the active alert).
    // Targets ~74-76 %RH at "now" so the hero card lights up critical.
    const minutesAgo = (NOW.getTime() - t) / 60000;
    if (minutesAgo > 0 && minutesAgo < 180) {
      const climb = Math.min(1, (180 - minutesAgo) / 90);
      hum += 32 * climb;
    }

    // Small temp spike yesterday afternoon (HVAC blip)
    const hoursAgo = (NOW.getTime() - t) / 3600000;
    if (hoursAgo > 22 && hoursAgo < 24) {
      temp += 1.6 * Math.exp(-Math.pow((hoursAgo - 23) / 0.4, 2));
    }

    out.push({
      t,
      temp: Math.round(temp * 10) / 10,
      humidity: Math.round(hum * 10) / 10,
    });
  }
  return out;
}

const FULL_SERIES = generateSeries();

// Helpers ──────────────────────────────────────────────────────
function clampSeries(rangeKey) {
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

// Dew point (Magnus formula) — bonus engineering value
function dewPoint(t, rh) {
  const a = 17.625, b = 243.04;
  const alpha = Math.log(rh / 100) + (a * t) / (b + t);
  return (b * alpha) / (a - alpha);
}

// Thresholds (typical server-room comfort envelope, ASHRAE-ish)
const THRESHOLDS = {
  temp: { lo: 18, hi: 27, critLo: 15, critHi: 30 },
  humidity: { lo: 30, hi: 60, critLo: 20, critHi: 70 },
};

// Comfort zones for the scatter plot
const COMFORT_ZONES = [
  { id: 'optimal', name: 'Optimal',     t: [20, 25], h: [40, 55], color: 'oklch(0.74 0.14 155)' },
  { id: 'accept',  name: 'Acceptable',  t: [18, 27], h: [30, 60], color: 'oklch(0.78 0.14 80)' },
  { id: 'risk',    name: 'At risk',     t: [15, 30], h: [20, 70], color: 'oklch(0.68 0.18 28)' },
];

// Single device for now — fleet-ready data structure
const DEVICES = [
  {
    id: 'dht22-01', name: 'DHT22-01',
    location: 'Server Room A · Rack 3',
    firmware: 'fw 1.4.2', mcu: 'ESP32-WROOM-32',
    rssi: -58, battery: null, // mains powered
    poweredBy: 'PoE',
    sampleRate: '0.20 Hz (5 min)',
    uptimeH: 41 * 24 + 7,
    lastSeenMs: NOW.getTime() - 47 * 1000,
    status: 'crit', // active humidity alert
  },
  // Placeholders showing the multi-device structure (rendered as "pending")
  { id: 'dht22-02', name: 'DHT22-02', location: 'Server Room B · Rack 1', status: 'pending' },
  { id: 'dht22-03', name: 'DHT22-03', location: 'Network Closet · 2F',     status: 'pending' },
];

// Alerts — chronological feed
const ALERTS = [
  {
    id: 'a-1043', sev: 'crit', unack: true,
    msg: 'Humidity above critical threshold (70 %RH) for 14 min',
    device: 'dht22-01', rule: 'RH > 70% / 15m',
    ts: NOW.getTime() - 14 * 60 * 1000,
  },
  {
    id: 'a-1042', sev: 'warn', unack: true,
    msg: 'Humidity above warning threshold (60 %RH)',
    device: 'dht22-01', rule: 'RH > 60% / 5m',
    ts: NOW.getTime() - 47 * 60 * 1000,
  },
  {
    id: 'a-1041', sev: 'info', unack: false,
    msg: 'Sensor reconnected after 38 s dropout',
    device: 'dht22-01', rule: 'link',
    ts: NOW.getTime() - 5.2 * 3600 * 1000,
  },
  {
    id: 'a-1040', sev: 'warn', unack: false,
    msg: 'Temperature spike +1.6 °C above moving average',
    device: 'dht22-01', rule: 'Δt > 1.5°C / 10m',
    ts: NOW.getTime() - 23 * 3600 * 1000,
  },
  {
    id: 'a-1039', sev: 'ok', unack: false,
    msg: 'Calibration check passed (RH offset -0.3%)',
    device: 'dht22-01', rule: 'maintenance',
    ts: NOW.getTime() - 2 * 86400 * 1000,
  },
  {
    id: 'a-1038', sev: 'info', unack: false,
    msg: 'Firmware updated to 1.4.2',
    device: 'dht22-01', rule: 'OTA',
    ts: NOW.getTime() - 4 * 86400 * 1000,
  },
];

// Export to global scope
Object.assign(window, {
  FULL_SERIES, clampSeries, downsample, stats,
  formatNum, formatRelative, formatClock, formatDate, formatDateTime,
  dewPoint, THRESHOLDS, COMFORT_ZONES, DEVICES, ALERTS, NOW,
});
