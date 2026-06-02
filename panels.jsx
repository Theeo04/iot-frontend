/* ============================================================
   Panels — composable card pieces.
   Hero, Stats, Chart shell, Comfort, DeviceList, Alerts, Export
   ============================================================ */

// Tiny SVG icons (1.5px stroke, currentColor)
function Icon({ name, size = 14 }) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (name) {
    case 'refresh': return (
      <svg {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
    );
    case 'download': return (
      <svg {...p}><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>
    );
    case 'cog': return (
      <svg {...p}><circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    );
    case 'plus': return (
      <svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></svg>
    );
    case 'check': return (
      <svg {...p}><path d="M20 6L9 17l-5-5" /></svg>
    );
    case 'arrow-up': return (
      <svg {...p}><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
    );
    case 'arrow-dn': return (
      <svg {...p}><path d="M12 5v14" /><path d="M19 12l-7 7-7-7" /></svg>
    );
    case 'arrow-flat': return (
      <svg {...p}><path d="M5 12h14" /></svg>
    );
    case 'thermo': return (
      <svg {...p}><path d="M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0z" /></svg>
    );
    case 'drop': return (
      <svg {...p}><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" /></svg>
    );
    case 'search': return (
      <svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
    );
    case 'chevron': return (
      <svg {...p}><path d="M9 18l6-6-6-6" /></svg>
    );
    default: return null;
  }
}

// ── Hero reading card ───────────────────────────────────────
function ReadingCard({ kind, value, unit, sparkData, sparkAcc, prev, trend, alert, sub }) {
  const accent = kind === 'temp' ? 'var(--temp)' : 'var(--hum)';
  const fill   = kind === 'temp' ? 'var(--temp-soft)' : 'var(--hum-soft)';
  const delta = value - prev;
  const deltaStr = (delta >= 0 ? '+' : '') + delta.toFixed(2);

  return (
    <div className={`card reading ${kind} ${alert ? 'alert' : ''}`}>
      <div className="reading-label">
        <span className="reading-swatch" />
        <Icon name={kind === 'temp' ? 'thermo' : 'drop'} size={11} />
        <span>{kind === 'temp' ? 'Temperature' : 'Relative humidity'}</span>
        <span style={{ flex: 1 }} />
        {alert
          ? <span className="alert-chip">● Critical</span>
          : <span className="alert-chip ok-chip">● Nominal</span>}
      </div>
      <div className="reading-value">
        {formatNum(value)}
        <span className="reading-unit">{unit}</span>
      </div>
      <div className="reading-spark">
        <Sparkline data={sparkData} accessor={sparkAcc} stroke={accent} fill={fill} />
      </div>
      <div className="reading-meta">
        <div className="meta-cell">
          <span className="k">Δ 60 min</span>
          <span className={`v ${delta > 0.2 ? 'up' : delta < -0.2 ? 'dn' : ''}`}>
            <Icon name={delta > 0.1 ? 'arrow-up' : delta < -0.1 ? 'arrow-dn' : 'arrow-flat'} size={10} />
            {' '}{deltaStr} {unit}
          </span>
        </div>
        <div className="meta-cell">
          <span className="k">Trend</span>
          <span className="v">{trend}</span>
        </div>
        <div className="meta-cell">
          <span className="k">{sub.k}</span>
          <span className="v">{sub.v}</span>
        </div>
      </div>
    </div>
  );
}

// ── Stats strip ─────────────────────────────────────────────
function StatsStrip({ series }) {
  const t = stats(series, 'temp');
  const h = stats(series, 'humidity');
  return (
    <div className="stats">
      <div className="stat"><span className="k">T min</span>
        <span className="v" style={{color:'var(--temp)'}}>{formatNum(t.min)}<span className="u">°C</span></span></div>
      <div className="stat"><span className="k">T avg</span>
        <span className="v">{formatNum(t.avg)}<span className="u">°C</span></span></div>
      <div className="stat"><span className="k">T max</span>
        <span className="v" style={{color:'var(--temp)'}}>{formatNum(t.max)}<span className="u">°C</span></span></div>
      <div className="stat"><span className="k">RH min</span>
        <span className="v" style={{color:'var(--hum)'}}>{formatNum(h.min)}<span className="u">%</span></span></div>
      <div className="stat"><span className="k">RH avg</span>
        <span className="v">{formatNum(h.avg)}<span className="u">%</span></span></div>
      <div className="stat"><span className="k">RH max</span>
        <span className="v" style={{color:'var(--hum)'}}>{formatNum(h.max)}<span className="u">%</span></span></div>
    </div>
  );
}

// ── Device info strip ─────────────────────────────────────
function DeviceInfoStrip({ device, latest }) {
  const dp = dewPoint(latest.temp, latest.humidity);
  return (
    <div className="info-strip">
      <div className="info-cell"><span className="k">Device</span><span className="v">{device.name}</span></div>
      <div className="info-cell"><span className="k">Location</span><span className="v">{device.location}</span></div>
      <div className="info-cell"><span className="k">MCU</span><span className="v">{device.mcu}</span></div>
      <div className="info-cell"><span className="k">Firmware</span><span className="v">{device.firmware}</span></div>
      <div className="info-cell"><span className="k">RSSI</span><span className="v ok">{device.rssi} dBm</span></div>
      <div className="info-cell"><span className="k">Uptime</span><span className="v">{Math.floor(device.uptimeH/24)}d {device.uptimeH%24}h</span></div>
      <div className="info-cell"><span className="k">Dew point</span><span className="v">{formatNum(dp)} °C</span></div>
    </div>
  );
}

// ── Comfort panel ───────────────────────────────────────────
function ComfortPanel({ data, presentation }) {
  const latest = data[data.length - 1];
  const dp = latest ? dewPoint(latest.temp, latest.humidity) : 0;

  function inZone(t, h, z) {
    return t >= z.t[0] && t <= z.t[1] && h >= z.h[0] && h <= z.h[1];
  }
  const currentZone = latest
    ? (COMFORT_ZONES.find(z => inZone(latest.temp, latest.humidity, z))?.name ?? 'Out of range')
    : '—';
  const inOptimal = data.filter(d => inZone(d.temp, d.humidity, COMFORT_ZONES[0])).length / data.length;

  return (
    <div className="comfort">
      <ComfortScatter data={data} presentation={presentation} />
      <div className="comfort-legend">
        {COMFORT_ZONES.map(z => (
          <div className="zone-row" key={z.id}>
            <span className="zone-color" style={{ background: z.color }} />
            <div>
              <div className="zone-name">{z.name}</div>
              <div className="zone-range">{z.t[0]}–{z.t[1]} °C · {z.h[0]}–{z.h[1]} %RH</div>
            </div>
          </div>
        ))}
        <div className="zone-now">
          <div className="k">Current zone</div>
          <div className="v" style={{
            color: currentZone === 'Optimal' ? 'var(--ok)'
                 : currentZone === 'Acceptable' ? 'var(--warn)'
                 : 'var(--crit)'
          }}>{currentZone}</div>
        </div>
        <div className="zone-now">
          <div className="k">Time in optimal</div>
          <div className="v">{(inOptimal * 100).toFixed(0)}%</div>
        </div>
        <div className="zone-now">
          <div className="k">Dew point</div>
          <div className="v">{formatNum(dp)} °C</div>
        </div>
      </div>
    </div>
  );
}

// ── Device list ────────────────────────────────────────────
function DeviceList({ devices, activeId, onSelect, latest }) {
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Devices</span>
        <span className="card-tag">{devices.length} · 1 online</span>
        <span className="card-spacer" />
        <button className="btn" style={{height:22, padding:'0 8px', fontSize:11}}>
          <Icon name="search" size={11} />
        </button>
      </div>
      <div className="devices">
        {devices.map(d => {
          const isActive = d.id === activeId;
          const cls = d.status === 'pending' ? 'off' : d.status === 'crit' ? 'crit' : d.status === 'warn' ? 'warn' : 'ok';
          return (
            <div key={d.id}
                 className={`device ${isActive ? 'active' : ''}`}
                 onClick={() => d.status !== 'pending' && onSelect(d.id)}
                 style={{ opacity: d.status === 'pending' ? 0.5 : 1 }}>
              <div className={`device-status ${cls}`} />
              <div>
                <div className="device-name">{d.name}</div>
                <div className="device-loc">{d.location}</div>
              </div>
              <div className="device-readings">
                {d.status === 'pending'
                  ? <span style={{color:'var(--fg-3)'}}>not provisioned</span>
                  : <>
                      <span className="t">{formatNum(latest.temp)}°</span>
                      {' / '}
                      <span className="h">{formatNum(latest.humidity)}%</span>
                    </>
                }
              </div>
            </div>
          );
        })}
        <div className="device-add">
          <Icon name="plus" size={11} />
          <span>Provision new sensor</span>
        </div>
      </div>
    </div>
  );
}

// ── Alert feed ────────────────────────────────────────────
function AlertsFeed({ alerts, onAck }) {
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Alerts</span>
        <span className="card-tag">{alerts.filter(a=>a.unack).length} unacknowledged</span>
        <span className="card-spacer" />
        <span className="card-tag">last 7d</span>
      </div>
      <div className="alerts">
        {alerts.map(a => (
          <div key={a.id} className={`alert-row ${a.unack ? 'unack' : 'ack'}`}>
            <div className={`alert-sev ${a.sev}`} />
            <div>
              <div className="alert-msg">{a.msg}</div>
              <div className="alert-meta">
                <span>{formatRelative(a.ts)}</span>
                <span className="pill">{a.sev}</span>
                <span className="pill">{a.device}</span>
                <span style={{color:'var(--fg-3)'}}>{a.rule}</span>
              </div>
            </div>
            {a.unack && (
              <button className="alert-ack" onClick={() => onAck(a.id)}>ACK</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Export panel ──────────────────────────────────────────
function ExportPanel({ rangeKey, sampleCount, onExport }) {
  const formats = [
    { id: 'csv',  name: 'CSV',     desc: 'Spreadsheet, ASCII' },
    { id: 'json', name: 'JSON',    desc: 'Schemaless records' },
    { id: 'pkl',  name: 'Parquet', desc: 'Columnar, compressed' },
    { id: 'png',  name: 'PNG',     desc: 'Chart snapshot' },
  ];
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Export</span>
        <span className="card-tag">{rangeKey} · {sampleCount.toLocaleString()} samples</span>
      </div>
      <div className="export-grid">
        {formats.map(f => (
          <div key={f.id} className="export-fmt" onClick={() => onExport(f.id)}>
            <div className="name">{f.name}</div>
            <div className="desc">{f.desc}</div>
          </div>
        ))}
      </div>
      <div className="export-row">
        <div className="export-summary"><span className="k">Range</span><span>{rangeKey}</span></div>
        <div className="export-summary"><span className="k">Fields</span><span>t, °C, %RH</span></div>
        <div className="export-summary"><span className="k">Cadence</span><span>5 min</span></div>
      </div>
    </div>
  );
}

Object.assign(window, {
  Icon, ReadingCard, StatsStrip, DeviceInfoStrip,
  ComfortPanel, DeviceList, AlertsFeed, ExportPanel,
});
