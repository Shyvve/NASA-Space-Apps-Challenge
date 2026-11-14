import { useMemo, useState } from 'react'
import { SUN_RADIUS_DEG } from '../lib/scenario.js'
import { Explain } from '../lib/learn.jsx'

export const SOLAR_CONSTANT = 1361 // W/m² at 1 AU, no atmosphere on the Moon
const RAD = Math.PI / 180

export const MOUNTS = {
  tracking: { label: 'Vertical, turns to follow the Sun', short: 'Vertical tracking' },
  fixed: { label: 'Vertical, fixed direction', short: 'Vertical fixed' },
  flat: { label: 'Flat on the deck (horizontal)', short: 'Horizontal' },
}

/** Panel output (W) for every sample of the series. */
export function powerSeries(series, clr, cfg) {
  const out = new Float32Array(series.t.length)
  const peak = SOLAR_CONSTANT * cfg.area * (cfg.eff / 100)
  for (let k = 0; k < out.length; k++) {
    const disk = Math.max(0, Math.min(1, clr.sun[k] / (2 * SUN_RADIUS_DEG)))
    if (!disk) continue
    const el = series.sunEl[k] * RAD
    let g
    if (cfg.mount === 'flat') g = Math.max(0, Math.sin(el))
    else if (cfg.mount === 'fixed') g = Math.max(0, Math.cos(el) * Math.cos((series.sunAz[k] - cfg.facing) * RAD))
    else g = Math.max(0, Math.cos(el))
    out[k] = peak * g * disk
  }
  return out
}

/** Battery needed to keep `load` running from a full start: the largest energy drawdown (Wh). */
function batteryNeed(p, load, stepH) {
  let level = 0, top = 0, worst = 0
  for (const w of p) {
    level += (w - load) * stepH
    if (level > top) top = level
    worst = Math.max(worst, top - level)
  }
  return worst
}

export function PowerPanel({ series, clr, index, cfg, onCfg }) {
  const p = useMemo(() => powerSeries(series, clr, cfg), [series, clr, cfg])
  const stepH = series.stepMin / 60
  const stats = useMemo(() => {
    let sum = 0, max = 0
    for (const w of p) { sum += w; if (w > max) max = w }
    const avg = sum / p.length
    return { avg, max, perDay: avg * 24, battery: batteryNeed(p, cfg.load, stepH) }
  }, [p, cfg.load, stepH])
  const deficit = stats.avg < cfg.load
  const W = 960, H = 140, L = 44, R = 10, T = 8, B = 20
  const yMax = Math.max(stats.max, cfg.load) * 1.1 || 1
  const x = (k) => L + (k / (p.length - 1)) * (W - L - R)
  const y = (w) => T + (1 - w / yMax) * (H - T - B)
  let area = `M${x(0)},${y(0)}`
  for (let k = 0; k < p.length; k++) area += `L${x(k).toFixed(1)},${y(p[k]).toFixed(1)}`
  area += `L${x(p.length - 1)},${y(0)}Z`
  const set = (k) => (e) => onCfg({ ...cfg, [k]: e.target.type === 'number' || e.target.type === 'range' ? Number(e.target.value) : e.target.value })

  return (
    <div className="panel" id="power-panel">
      <div className="panel-head">
        <h2>Solar power &amp; battery</h2>
        <p>Output of your solar array over {series.days} days, using the real Sun angle and terrain shadow. No air on the Moon, so sunlight arrives at full strength ({SOLAR_CONSTANT} W/m²).</p>
      </div>
      <div className="power">
        <div className="power-form">
          <label className="field"><span>Panel area (m²)</span><input type="number" min="0.1" step="0.1" value={cfg.area} onChange={set('area')} /></label>
          <label className="field"><span>Cell efficiency (%)</span><input type="number" min="1" max="50" step="1" value={cfg.eff} onChange={set('eff')} /></label>
          <label className="field"><span>Mounting</span>
            <select value={cfg.mount} onChange={set('mount')}>
              {Object.entries(MOUNTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          {cfg.mount === 'fixed' && (
            <label className="field"><span>Panel faces azimuth: <b>{cfg.facing}°</b></span><input type="range" min="0" max="359" value={cfg.facing} onChange={set('facing')} /></label>
          )}
          <label className="field"><span>Lander power use (W)</span><input type="number" min="0" step="5" value={cfg.load} onChange={set('load')} /></label>
        </div>
        <div className="power-out">
          <div className="power-stats">
            <div><span className="muted small">Now</span><b className="mono">{Math.round(p[index])} W</b></div>
            <div><span className="muted small">Average</span><b className="mono">{Math.round(stats.avg)} W</b></div>
            <div><span className="muted small">Energy / Earth day</span><b className="mono">{(stats.perDay / 1000).toFixed(2)} kWh</b></div>
            <div className={deficit ? 'bad' : ''}><span className="muted small">Battery needed</span><b className="mono">{deficit ? 'not enough sun' : `${(stats.battery / 1000).toFixed(2)} kWh`}</b></div>
          </div>
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Solar power over time">
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={L} x2={W - R} y1={y(yMax * f / 1.1)} y2={y(yMax * f / 1.1)} className="grid" />
                <text x={L - 6} y={y(yMax * f / 1.1) + 4} className="axis" textAnchor="end">{Math.round(yMax * f / 1.1)}</text>
              </g>
            ))}
            <path d={area} className="power-area" />
            <line x1={L} x2={W - R} y1={y(cfg.load)} y2={y(cfg.load)} className="load-line" />
            <text x={W - R - 4} y={y(cfg.load) - 4} className="axis" textAnchor="end">load {cfg.load} W</text>
            <line x1={x(index)} x2={x(index)} y1={T} y2={H - B} className="cursor" />
            <text x={L} y={H - 4} className="axis">W, next {series.days} days</text>
          </svg>
          <p className="muted small">
            {deficit
              ? `Over ${series.days} days the array makes less energy than the lander uses. Add panel area, cut the load, or pick another site or date.`
              : `To keep ${cfg.load} W running through the darkest stretch, carry at least ${(stats.battery / 1000).toFixed(2)} kWh of usable battery.`}
          </p>
        </div>
      </div>
      <Explain title="How does the lander get electricity?" links={[{ id: 'status-cards', label: 'Sun status' }, { id: 'timeline-panel', label: 'Timeline' }]}>
        <p>Solar panels turn sunlight into electricity. They work best when the light hits them straight on. Near the pole the Sun is almost on the horizon, so panels stand <b>upright</b> (like a wall) and turn to follow it. A flat panel would get almost nothing.</p>
        <p>At night the lander lives on its <b>battery</b>. The longer the night, the bigger (and heavier) the battery must be. That is why the landing date and site decide the whole design.</p>
      </Explain>
    </div>
  )
}
