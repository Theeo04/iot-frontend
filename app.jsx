/* ============================================================
   Main App — DHT22 IoT Dashboard
   ============================================================ */

const { useState, useEffect, useMemo, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "density": "comfortable",
  "chartStyle": "area",
  "comfortPresentation": "both",
  "showThreshold": true
}/*EDITMODE-END*/;

function App() {
  // ── Tweaks ───────────────────────────────────
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    document.body.dataset.theme = tw.theme;
    document.body.dataset.density = tw.density;
  }, [tw.theme, tw.density]);

  // ── Data state ───────────────────────────────
  const [activeDeviceId, setActiveDeviceId] = useState(DEVICES[0].id);
  const [rangeKey, setRangeKey] = useState('24h');
  const [showTemp, setShowTemp] = useState(true);
  const [showHum, setShowHum] = useState(true);

  // Live-tick: small jitter on the latest reading to feel live
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 4000);
    return () => clearInterval(id);
  }, []);

  // Pull the visible series (memoised); apply a tiny jitter to the last point.
  const series = useMemo(() => {
    const s = clampSeries(rangeKey);
    return downsample(s, rangeKey === '24h' ? 288 : rangeKey === '7d' ? 336 : 360);
  }, [rangeKey]);

  const live = useMemo(() => {
    const base = FULL_SERIES[FULL_SERIES.length - 1];
    const jitter = (Math.sin(tick / 3) + Math.cos(tick / 1.7)) * 0.15;
    return {
      t: NOW.getTime() + tick * 4000,
      temp: base.temp + jitter * 0.2,
      humidity: base.humidity + jitter * 0.3,
    };
  }, [tick]);

  // 60-min sparkline window for hero cards
  const sparkData = useMemo(() => {
    const last = FULL_SERIES.slice(-12 * 1); // 60 min @ 5 min
    return last;
  }, []);

  // 60-min ago value for delta
  const sixtyMinAgo = FULL_SERIES[FULL_SERIES.length - 12];

  // ── Alerts state (allow ACK) ─────────────────
  const [alerts, setAlerts] = useState(ALERTS);
  const onAck = (id) => setAlerts(a => a.map(x => x.id === id ? { ...x, unack: false } : x));

  // ── Toast ────────────────────────────────────
  const [toast, setToast] = useState(null);
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }
  function onExport(fmt) {
    showToast(`Exporting ${series.length.toLocaleString()} samples · ${fmt.toUpperCase()} · ${rangeKey}`);
  }

  // ── Active device & trend computation ────────
  const device = DEVICES.find(d => d.id === activeDeviceId);
  const recent = FULL_SERIES.slice(-12);
  const tempSlope = (recent[recent.length - 1].temp - recent[0].temp);
  const humSlope = (recent[recent.length - 1].humidity - recent[0].humidity);

  return (
    <>
      {/* ── Top bar ─────────────────────────────── */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div className="brand-title">IoT Dashboard</div>
            <div className="brand-sub">DHT22 · TELEMETRY</div>
          </div>
        </div>
        <div style={{width:1, height:24, background:'var(--border)'}} />
        <nav className="crumbs">
          <span>Sites</span>
          <span className="sep">/</span>
          <span>HQ Bucharest</span>
          <span className="sep">/</span>
          <span>Server Room A</span>
          <span className="sep">/</span>
          <span className="here">{device.name}</span>
        </nav>
        <div className="topbar-spacer" />
        <span className="conn-pill">
          <span className="conn-dot" />
          MQTT · connected · {formatRelative(device.lastSeenMs)}
        </span>
        <button className="btn"><Icon name="refresh" /> Refresh</button>
        <button className="btn primary"><Icon name="download" /> Export</button>
      </header>

      {/* ── Layout ──────────────────────────────── */}
      <div className="layout">
        {/* LEFT column ────────────────────────── */}
        <div className="col">
          {/* Hero readings */}
          <div className="hero">
            <ReadingCard
              kind="temp"
              value={live.temp}
              unit="°C"
              sparkData={sparkData}
              sparkAcc={d => d.temp}
              prev={sixtyMinAgo.temp}
              trend={tempSlope > 0.2 ? 'rising' : tempSlope < -0.2 ? 'falling' : 'stable'}
              alert={live.temp < THRESHOLDS.temp.critLo || live.temp > THRESHOLDS.temp.critHi}
              sub={{ k: 'Range today', v: `${formatNum(stats(clampSeries('24h'),'temp').min)}–${formatNum(stats(clampSeries('24h'),'temp').max)} °C` }}
            />
            <ReadingCard
              kind="hum"
              value={live.humidity}
              unit="%RH"
              sparkData={sparkData}
              sparkAcc={d => d.humidity}
              prev={sixtyMinAgo.humidity}
              trend={humSlope > 1 ? 'rising' : humSlope < -1 ? 'falling' : 'stable'}
              alert={live.humidity > THRESHOLDS.humidity.critHi}
              sub={{ k: 'Threshold', v: `${THRESHOLDS.humidity.lo}–${THRESHOLDS.humidity.hi} %RH` }}
            />
          </div>

          {/* Device info strip */}
          <DeviceInfoStrip device={device} latest={live} />

          {/* Stats strip */}
          <StatsStrip series={clampSeries(rangeKey)} />

          {/* Time series chart */}
          <div className="card">
            <div className="card-head">
              <span className="card-title">History</span>
              <span className="card-tag">range</span>
              <div className="tabs">
                {['24h','7d','30d'].map(k => (
                  <button key={k}
                    className={`tab ${rangeKey===k?'active':''}`}
                    onClick={() => setRangeKey(k)}>
                    {k}
                  </button>
                ))}
              </div>
              <span className="card-spacer" />
              <div className="toggle-group">
                <button className={`toggle ${showTemp?'on':''}`} onClick={() => setShowTemp(v=>!v)}>
                  <span className="dot" style={{background:'var(--temp)'}} />
                  Temp
                </button>
                <button className={`toggle ${showHum?'on':''}`} onClick={() => setShowHum(v=>!v)}>
                  <span className="dot" style={{background:'var(--hum)'}} />
                  Humidity
                </button>
              </div>
            </div>
            <div className="chart-wrap">
              <TimeSeriesChart
                data={series}
                range={rangeKey}
                showTemp={showTemp}
                showHum={showHum}
                chartStyle={tw.chartStyle}
                thresholds={THRESHOLDS}
              />
            </div>
            <div className="chart-legend">
              <span className="leg">
                <span className="leg-line" style={{background:'var(--temp)'}} />
                Temperature (°C, left axis)
              </span>
              <span className="leg">
                <span className="leg-line" style={{background:'var(--hum)'}} />
                Humidity (%RH, right axis)
              </span>
              {tw.showThreshold && (
                <span className="leg" style={{color:'var(--crit)'}}>
                  <span className="leg-line" style={{background:'var(--crit)', borderTop:'1px dashed'}} />
                  RH critical {THRESHOLDS.humidity.critHi}%
                </span>
              )}
              <span className="card-spacer" />
              <span style={{color:'var(--fg-3)'}}>{series.length} samples · 5 min cadence</span>
            </div>
          </div>

          {/* Comfort zone */}
          <div className="card">
            <div className="card-head">
              <span className="card-title">Comfort zone</span>
              <span className="card-tag">temp × humidity · {rangeKey}</span>
              <span className="card-spacer" />
              <div className="toggle-group">
                {[
                  ['both', 'Zones + samples'],
                  ['zones-only', 'Zones only'],
                  ['scatter-only', 'Samples only'],
                ].map(([k, l]) => (
                  <button key={k}
                    className={`toggle ${tw.comfortPresentation === k ? 'on' : ''}`}
                    onClick={() => setTweak('comfortPresentation', k)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <ComfortPanel data={series} presentation={tw.comfortPresentation} />
          </div>
        </div>

        {/* RIGHT rail ─────────────────────────── */}
        <div className="col">
          <DeviceList
            devices={DEVICES}
            activeId={activeDeviceId}
            onSelect={setActiveDeviceId}
            latest={live}
          />
          <AlertsFeed alerts={alerts} onAck={onAck} />
          <ExportPanel rangeKey={rangeKey} sampleCount={series.length} onExport={onExport} />
        </div>
      </div>

      {/* ── Tweaks panel ────────────────────────── */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme">
          <TweakRadio
            label="Mode"
            value={tw.theme}
            options={[{value:'dark',label:'Dark'},{value:'light',label:'Light'}]}
            onChange={v => setTweak('theme', v)}
          />
          <TweakRadio
            label="Density"
            value={tw.density}
            options={[{value:'comfortable',label:'Comfy'},{value:'compact',label:'Compact'}]}
            onChange={v => setTweak('density', v)}
          />
        </TweakSection>
        <TweakSection label="Charts">
          <TweakRadio
            label="Style"
            value={tw.chartStyle}
            options={[{value:'line',label:'Line'},{value:'area',label:'Area'}]}
            onChange={v => setTweak('chartStyle', v)}
          />
          <TweakToggle
            label="Show critical threshold"
            value={tw.showThreshold}
            onChange={v => setTweak('showThreshold', v)}
          />
        </TweakSection>
        <TweakSection label="Comfort zone">
          <TweakSelect
            label="Presentation"
            value={tw.comfortPresentation}
            options={[
              {value:'both', label:'Zones + samples'},
              {value:'zones-only', label:'Zones only'},
              {value:'scatter-only', label:'Samples only'},
            ]}
            onChange={v => setTweak('comfortPresentation', v)}
          />
        </TweakSection>
      </TweaksPanel>

      {toast && (
        <div className="toast">
          <Icon name="check" size={12} />
          {toast}
        </div>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
