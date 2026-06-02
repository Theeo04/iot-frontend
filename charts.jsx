/* ============================================================
   Charts — pure SVG, no chart library.
   Includes: Sparkline, TimeSeriesChart, ComfortScatter
   ============================================================ */

const { useMemo } = React;

// ── Sparkline ────────────────────────────────────────────────
function Sparkline({ data, accessor, width = 220, height = 60, stroke, fill }) {
  if (!data || !data.length) return null;
  const vals = data.map(accessor);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = height - ((accessor(d) - min) / range) * (height - 8) - 4;
    return [x, y];
  });

  const path = points
    .map(([x, y], i) => (i === 0 ? `M${x.toFixed(1)} ${y.toFixed(1)}` : `L${x.toFixed(1)} ${y.toFixed(1)}`))
    .join(' ');
  const areaPath = `${path} L${width} ${height} L0 ${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={areaPath} fill={fill} opacity={0.7} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r="2.5" fill={stroke}
      />
    </svg>
  );
}

// ── Time series chart ────────────────────────────────────────
function TimeSeriesChart({ data, range, showTemp, showHum, chartStyle, thresholds }) {
  const W = 880, H = 320;
  const PAD = { l: 44, r: 44, t: 16, b: 28 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const { tempPath, tempArea, humPath, humArea, tScale, hScale, xTicks, yTicksLeft, yTicksRight, xScale } = useMemo(() => {
    if (!data.length) return {};

    // Domain for temperature (left axis)
    const tVals = data.map(d => d.temp);
    const tMin = Math.floor(Math.min(...tVals) - 1);
    const tMax = Math.ceil(Math.max(...tVals) + 1);
    // Domain for humidity (right axis)
    const hVals = data.map(d => d.humidity);
    const hMin = Math.max(0, Math.floor(Math.min(...hVals) - 5));
    const hMax = Math.min(100, Math.ceil(Math.max(...hVals) + 5));

    const xScale = (i) => PAD.l + (i / (data.length - 1)) * innerW;
    const tScale = (v) => PAD.t + (1 - (v - tMin) / (tMax - tMin)) * innerH;
    const hScale = (v) => PAD.t + (1 - (v - hMin) / (hMax - hMin)) * innerH;

    function buildPath(values, scale) {
      return values
        .map((v, i) => {
          const x = xScale(i);
          const y = scale(v);
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');
    }
    const tempPath = buildPath(tVals, tScale);
    const humPath = buildPath(hVals, hScale);
    const tempArea = `${tempPath} L${xScale(data.length - 1).toFixed(1)} ${(PAD.t + innerH).toFixed(1)} L${xScale(0).toFixed(1)} ${(PAD.t + innerH).toFixed(1)} Z`;
    const humArea  = `${humPath} L${xScale(data.length - 1).toFixed(1)} ${(PAD.t + innerH).toFixed(1)} L${xScale(0).toFixed(1)} ${(PAD.t + innerH).toFixed(1)} Z`;

    // X ticks
    const tickCount = range === '24h' ? 6 : range === '7d' ? 7 : 6;
    const xTicks = [];
    for (let i = 0; i < tickCount; i++) {
      const idx = Math.round((i / (tickCount - 1)) * (data.length - 1));
      xTicks.push({
        x: xScale(idx),
        label: range === '24h' ? formatClock(data[idx].t) : formatDate(data[idx].t),
      });
    }

    // Y ticks
    const yTicksLeft = [];
    const tStep = (tMax - tMin) / 4;
    for (let i = 0; i <= 4; i++) {
      const v = tMin + i * tStep;
      yTicksLeft.push({ y: tScale(v), label: v.toFixed(0) });
    }
    const yTicksRight = [];
    const hStep = (hMax - hMin) / 4;
    for (let i = 0; i <= 4; i++) {
      const v = hMin + i * hStep;
      yTicksRight.push({ y: hScale(v), label: v.toFixed(0) });
    }

    return { tempPath, tempArea, humPath, humArea, tScale, hScale, xTicks, yTicksLeft, yTicksRight, xScale };
  }, [data, range, innerW, innerH]);

  if (!data.length) return null;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {/* Y grid */}
      {yTicksLeft.map((tk, i) => (
        <line key={i} className="grid-line"
          x1={PAD.l} x2={W - PAD.r} y1={tk.y} y2={tk.y} />
      ))}
      {/* X grid */}
      {xTicks.map((tk, i) => (
        <line key={`x${i}`} className="grid-line"
          x1={tk.x} x2={tk.x} y1={PAD.t} y2={H - PAD.b} opacity="0.6" />
      ))}

      {/* Critical-humidity threshold (rendered against right axis) */}
      {showHum && (
        <>
          <line className="threshold-line"
            x1={PAD.l} x2={W - PAD.r}
            y1={hScale(thresholds.humidity.critHi)} y2={hScale(thresholds.humidity.critHi)} />
          <text className="threshold-label"
            x={W - PAD.r - 4} y={hScale(thresholds.humidity.critHi) - 4}
            textAnchor="end">
            RH crit {thresholds.humidity.critHi}%
          </text>
        </>
      )}

      {/* Areas (only when chartStyle === 'area') */}
      {chartStyle === 'area' && showHum && (
        <path d={humArea} fill="var(--hum-soft)" />
      )}
      {chartStyle === 'area' && showTemp && (
        <path d={tempArea} fill="var(--temp-soft)" />
      )}

      {/* Lines */}
      {showHum && (
        <path d={humPath} fill="none" stroke="var(--hum)" strokeWidth="1.5" strokeLinejoin="round" />
      )}
      {showTemp && (
        <path d={tempPath} fill="none" stroke="var(--temp)" strokeWidth="1.5" strokeLinejoin="round" />
      )}

      {/* Latest dots */}
      {showTemp && (
        <circle cx={xScale(data.length - 1)} cy={tScale(data[data.length - 1].temp)} r="3" fill="var(--temp)" />
      )}
      {showHum && (
        <circle cx={xScale(data.length - 1)} cy={hScale(data[data.length - 1].humidity)} r="3" fill="var(--hum)" />
      )}

      {/* Y axis labels (left = temp) */}
      {showTemp && yTicksLeft.map((tk, i) => (
        <text key={i} className="axis-tick"
          x={PAD.l - 8} y={tk.y + 3} textAnchor="end" fill="var(--temp)">
          {tk.label}°
        </text>
      ))}
      {/* Y axis labels (right = hum) */}
      {showHum && yTicksRight.map((tk, i) => (
        <text key={i} className="axis-tick"
          x={W - PAD.r + 8} y={tk.y + 3} textAnchor="start" fill="var(--hum)">
          {tk.label}%
        </text>
      ))}
      {/* X axis labels */}
      {xTicks.map((tk, i) => (
        <text key={i} className="axis-tick"
          x={tk.x} y={H - 10} textAnchor="middle">
          {tk.label}
        </text>
      ))}

      {/* Axis baseline */}
      <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b}
        stroke="var(--border-strong)" strokeWidth="1" />
    </svg>
  );
}

// ── Comfort scatter ─────────────────────────────────────────
function ComfortScatter({ data, presentation }) {
  const W = 540, H = 280;
  const PAD = { l: 40, r: 16, t: 14, b: 28 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  // Domain: temp 14..32, hum 15..85 (server-room friendly window)
  const tMin = 14, tMax = 32, hMin = 15, hMax = 85;
  const xScale = (t) => PAD.l + ((t - tMin) / (tMax - tMin)) * innerW;
  const yScale = (h) => PAD.t + (1 - (h - hMin) / (hMax - hMin)) * innerH;

  // Sample points for the scatter (downsample to ~80 points)
  const sample = useMemo(() => {
    const step = Math.max(1, Math.floor(data.length / 80));
    const out = [];
    for (let i = 0; i < data.length; i += step) out.push(data[i]);
    return out;
  }, [data]);

  const latest = data[data.length - 1];

  // Color a sample point by which zone it's in
  function zoneOf(t, h) {
    for (const z of COMFORT_ZONES) {
      if (t >= z.t[0] && t <= z.t[1] && h >= z.h[0] && h <= z.h[1]) return z.id;
    }
    return 'out';
  }
  const zoneColor = {
    optimal: 'oklch(0.74 0.14 155)',
    accept:  'oklch(0.78 0.14 80)',
    risk:    'oklch(0.68 0.18 28)',
    out:     'oklch(0.55 0.18 28)',
  };

  // X ticks (temp)
  const xTicks = [16, 20, 24, 28, 32];
  const yTicks = [20, 40, 60, 80];

  return (
    <svg className="comfort-scatter" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {/* Zone bands (nested rectangles, outermost first) */}
      {presentation !== 'scatter-only' && [...COMFORT_ZONES].reverse().map(z => {
        const x = xScale(z.t[0]);
        const w = xScale(z.t[1]) - x;
        const y = yScale(z.h[1]);
        const h = yScale(z.h[0]) - y;
        return (
          <g key={z.id}>
            <rect x={x} y={y} width={w} height={h}
              fill={z.color} opacity="0.10"
              stroke={z.color} strokeOpacity="0.45" strokeDasharray="3 3" />
            <text x={x + 6} y={y + 12}
              className="axis-tick" fill={z.color} fontSize="10" opacity="0.85"
              style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {z.name}
            </text>
          </g>
        );
      })}

      {/* Grid */}
      {xTicks.map((t, i) => (
        <line key={`xg${i}`} className="grid-line"
          x1={xScale(t)} x2={xScale(t)} y1={PAD.t} y2={H - PAD.b} />
      ))}
      {yTicks.map((h, i) => (
        <line key={`yg${i}`} className="grid-line"
          x1={PAD.l} x2={W - PAD.r} y1={yScale(h)} y2={yScale(h)} />
      ))}

      {/* Scatter samples — older points fainter */}
      {presentation !== 'zones-only' && sample.map((d, i) => {
        const age = (sample.length - i) / sample.length;
        const opacity = 0.25 + (1 - age) * 0.55;
        return (
          <circle key={i}
            cx={xScale(d.temp)} cy={yScale(d.humidity)}
            r="2.5"
            fill={zoneColor[zoneOf(d.temp, d.humidity)]}
            opacity={opacity} />
        );
      })}

      {/* Latest point — highlighted */}
      {latest && (
        <g>
          <circle cx={xScale(latest.temp)} cy={yScale(latest.humidity)}
            r="9" fill="none" stroke="var(--fg-0)" strokeOpacity="0.4" />
          <circle cx={xScale(latest.temp)} cy={yScale(latest.humidity)}
            r="5" fill="var(--fg-0)" />
          <text x={xScale(latest.temp) + 12} y={yScale(latest.humidity) - 6}
            fill="var(--fg-0)" fontSize="11" fontFamily="var(--mono)">
            NOW · {formatNum(latest.temp)}° / {formatNum(latest.humidity)}%
          </text>
        </g>
      )}

      {/* Axes */}
      {xTicks.map((t, i) => (
        <text key={`xt${i}`} className="axis-tick"
          x={xScale(t)} y={H - 10} textAnchor="middle">
          {t}°
        </text>
      ))}
      {yTicks.map((h, i) => (
        <text key={`yt${i}`} className="axis-tick"
          x={PAD.l - 8} y={yScale(h) + 3} textAnchor="end">
          {h}%
        </text>
      ))}
      <text className="y-axis-lbl" x={PAD.l - 28} y={PAD.t + 8}>%RH</text>
      <text className="y-axis-lbl" x={W - PAD.r} y={H - PAD.b + 22} textAnchor="end">°C →</text>
    </svg>
  );
}

Object.assign(window, { Sparkline, TimeSeriesChart, ComfortScatter });
