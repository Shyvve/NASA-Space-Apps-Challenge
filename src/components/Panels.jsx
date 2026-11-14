import { useMemo, useRef, useState } from 'react'
import { SITES } from '../data/sites.js'
import { EARTH_RADIUS_DEG, SUN_RADIUS_DEG, clearances, formatDuration, metricsAt } from '../lib/scenario.js'
import { useHorizon, useSeries } from '../lib/useSeries.js'
import { quickAccuracy } from '../lib/quickTerrain.js'
import { Explain, Info, useWords } from '../lib/learn.jsx'
import { downloadText } from '../lib/export.js'

const DAY = 86400000
const groups = [...new Set(SITES.map((s) => s.group))]

export const fmtDeg = (v, d = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}°`
export const fmtUTC = (ms) =>
  new Date(ms).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC'
const toInput = (d) => d.toISOString().slice(0, 16)

export function verdict(m, w = (e) => e) {
  if (m.viaRelay && m.sunUp) return { cls: 'go', text: w('Power + link via relay satellite', 'Sunlight, and contact with Earth through the satellite') }
  if (m.viaRelay) return { cls: 'warn', text: w('Link via relay only — Sun below horizon', 'Night, but contact through the satellite works') }
  if (m.sunUp && m.earthUp) return { cls: 'go', text: w('Power + direct-to-Earth link', 'All good: sunlight for power and Earth in view to talk home') }
  if (m.sunUp) return { cls: 'warn', text: w('Power only — no Earth in view', 'Sunlight, but Earth is hidden: no radio contact') }
  if (m.earthUp) return { cls: 'warn', text: w('Comms only — Sun below horizon', 'Earth in view, but it is night: running on batteries') }
  return { cls: 'nogo', text: w('No power, no direct comms', 'Night and no Earth: no power and no contact') }
}

export function SitePicker({ siteId, lat, lon, onSite, onCoords, landing, onLanding, mask, onMask, terrain }) {
  return (
    <div className="panel controls">
      <label className="field">
        <span>Landing site</span>
        <select value={siteId} onChange={(e) => onSite(e.target.value)}>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {SITES.filter((s) => s.group === g).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          ))}
          <option value="custom">Custom coordinates…</option>
        </select>
      </label>
      <div className="row2">
        <label className="field">
          <span>Latitude °</span>
          <input type="number" step="0.01" min="-90" max="90" value={lat}
            onChange={(e) => onCoords(Number(e.target.value), lon)} />
        </label>
        <label className="field">
          <span>Longitude °E</span>
          <input type="number" step="0.01" min="-180" max="360" value={lon}
            onChange={(e) => onCoords(lat, Number(e.target.value))} />
        </label>
      </div>
      <label className="field">
        <span>Landing date &amp; time (UTC)</span>
        <input type="datetime-local" value={toInput(landing)}
          onChange={(e) => e.target.value && onLanding(new Date(`${e.target.value}:00Z`))} />
      </label>
      <label className="field">
        <span className="field-head">Extra horizon margin: <b>{mask.toFixed(1)}°</b>
          <Info label="About the margin">
            {terrain
              ? `Real terrain from LOLA is already included (${terrain.resolutionM} m/px). Add a margin for local boulders, the lander's own structure, or a safety buffer.`
              : 'No terrain data yet: the horizon is flat. Raise this to approximate nearby ridges and crater walls.'}
          </Info>
        </span>
        <input type="range" min="0" max="5" step="0.1" value={mask} onChange={(e) => onMask(Number(e.target.value))} />
      </label>
    </div>
  )
}

export function MetricCards({ m, source }) {
  const w = useWords()
  const v = verdict(m, w)
  const sunFlip = formatDuration(m.sunFlipHours)
  const earthFlip = formatDuration(m.earthFlipHours)
  const never = `> ${m.windowDays} d`
  return (
    <div id="status-cards">
      <div className="cards">
        <div className={`card verdict ${v.cls}`}>
          <div className="label">{w('Status at this moment', 'Right now at the landing site')}</div>
          <div className="big">{v.text}</div>
          <div className="sub">
            Data: {source === 'horizons' ? 'JPL Horizons (DE441)' : 'computed in browser (IAU Moon model)'}
          </div>
        </div>
        <div className="card">
          <div className="label"><i className="dot-ico sun" /> {w('Solar elevation', 'How high the Sun is')}</div>
          <div className="big mono">{fmtDeg(m.sunEl)}</div>
          <div className="sub">
            {w(`az ${m.sunAz.toFixed(1)}° · horizon there ${fmtDeg(m.sunHorizon, 1)} · disk ${Math.round(m.diskFraction * 100)}% visible`,
              `Mountains in that direction reach ${fmtDeg(m.sunHorizon, 1)}. ${Math.round(m.diskFraction * 100)}% of the Sun is visible.`)}
          </div>
          <div className={`countdown ${m.sunUp ? 'up' : 'down'}`}>
            {m.sunUp ? w('Sunset in ', 'Night starts in ') : w('Sunrise in ', 'Day starts in ')}<b>{sunFlip ?? never}</b>
          </div>
        </div>
        <div className="card">
          <div className="label"><i className="dot-ico earth" /> {w('Earth elevation', 'How high the Earth is')}</div>
          <div className="big mono">{fmtDeg(m.earthEl)}</div>
          <div className="sub">
            {w(`az ${m.earthAz.toFixed(1)}° · horizon there ${fmtDeg(m.earthHorizon, 1)}`, `Mountains in that direction reach ${fmtDeg(m.earthHorizon, 1)}.`)}
          </div>
          <div className={`countdown ${m.earthUp ? 'up' : 'down'}`}>
            {m.earthUp ? w('Earthset in ', 'Contact lost in ') : w('Earthrise in ', 'Contact back in ')}<b>{earthFlip ?? never}</b>
          </div>
        </div>
        <div className="card">
          <div className="label">{w(`Next ${m.windowDays} days`, `The next ${m.windowDays} days`)}</div>
          <Bar label={w('Sunlight', 'Sunny')} pct={m.sunPct} cls="sun" />
          <Bar label={w('Earth in view', 'Can talk')} pct={m.earthPct} cls="earth" />
          <Bar label={w('Both', 'Both')} pct={m.bothPct} cls="both" />
          <div className="sub">{w('Longest night', 'Longest darkness')} {formatDuration(m.longestDarkHours) || '0 h'} · {w('peak Sun', 'highest Sun')} {fmtDeg(m.maxSunEl, 1)}</div>
        </div>
      </div>
      <Explain title="What do these numbers mean?" links={[{ id: 'sky-panel', label: 'Sky view' }, { id: 'power-panel', label: 'Power' }, { id: 'timeline-panel', label: 'Timeline' }]}>
        <p>A lander needs two things: <b>sunlight</b> to make electricity with solar panels, and a <b>straight line to Earth</b> to send radio messages home. There is no air on the Moon to bend radio waves around mountains.</p>
        <p><b>Elevation</b> is how many degrees above the flat horizon something is (0° = on the horizon, 90° = straight up). But real mountains stick up too, so the Sun counts as "up" only when it is higher than the mountains in its direction.</p>
      </Explain>
    </div>
  )
}

function Bar({ label, pct, cls }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <div className="track"><div className={`fill ${cls}`} style={{ width: `${pct}%` }} /></div>
      <b className="mono">{Math.round(pct)}%</b>
    </div>
  )
}

/** Landing-date sweep: for each candidate landing day, how much Sun/Earth the following 14 days offer. */
export function DatePlanner({ siteId, lat, lon, landing, onPick, horizon }) {
  const planStart = useMemo(() => {
    const d = new Date(landing)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  }, [landing.getUTCFullYear(), landing.getUTCMonth()])
  const DAYS = 120, WIN = 14
  const series = useSeries(siteId, lat, lon, planStart, DAYS + WIN, 60)
  const rows = useMemo(() => {
    const out = []
    const clr = clearances(series, horizon)
    for (let d = 0; d < DAYS; d++) {
      const m = metricsAt(series, d * 24, horizon, WIN, clr)
      out.push({ d, sun: m.sunPct, earth: m.earthPct, both: m.bothPct })
    }
    return out
  }, [series, horizon])
  const landingDay = Math.floor((landing.getTime() - planStart.getTime()) / DAY)
  const best = rows.reduce((a, b) => (b.both > a.both ? b : a), rows[0])
  const cell = (pct, kind) => ({ background: `color-mix(in oklab, var(--${kind}) ${Math.round(pct)}%, var(--cell-empty))` })
  return (
    <div className="panel" id="planner-panel">
      <div className="panel-head">
        <h2>Landing date planner</h2>
        <Info>Each column is a landing day; colour shows how much of the following {WIN} days have Sun, Earth or both in view. Click a day to load it.</Info>
        <span className="best-day small">
          Best day:{' '}
          <button className="link" onClick={() => onPick(new Date(planStart.getTime() + best.d * DAY))}>
            {new Date(planStart.getTime() + best.d * DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
            {' '}({Math.round(best.both)}%)
          </button>
        </span>
      </div>
      <div className="heat">
        {[['sun', 'Sunlight'], ['earth', 'Earth'], ['both', 'Both']].map(([k, label]) => (
          <div className="heat-row" key={k}>
            <span className="heat-label">{label}</span>
            <div className="heat-cells">
              {rows.map((r) => (
                <button key={r.d} className={`heat-cell ${r.d === landingDay ? 'sel' : ''}`} style={cell(r[k], k)}
                  title={`${new Date(planStart.getTime() + r.d * DAY).toDateString()}: ${label} ${Math.round(r[k])}%`}
                  onClick={() => onPick(new Date(planStart.getTime() + r.d * DAY + (landing.getTime() % DAY)))} />
              ))}
            </div>
          </div>
        ))}
        <div className="heat-row">
          <span className="heat-label" />
          <div className="heat-cells months">
            {rows.filter((r) => new Date(planStart.getTime() + r.d * DAY).getUTCDate() === 1).map((r) => (
              <span key={r.d} style={{ left: `${(r.d / DAYS) * 100}%` }}>
                {new Date(planStart.getTime() + r.d * DAY).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })}
              </span>
            ))}
          </div>
        </div>
      </div>
      <Explain title="Why does the date matter so much?" links={[{ id: 'timeline-panel', label: 'Timeline' }, { id: 'compare-panel', label: 'Compare plans' }]}>
        <p>The Moon turns once every 29.5 Earth days, so one "day" there lasts about two weeks and one "night" about two weeks too. Land at the start of the lunar day and you get two weeks of sunshine. Land a week later and night comes after only a few days.</p>
        <p>Earth also slowly wobbles up and down in the lunar sky (this is called <b>libration</b>), so radio contact from the poles comes and goes over weeks. Brighter columns are better landing days.</p>
      </Explain>
    </div>
  )
}

function CompareRow({ s, onRemove, onLoad, onMetrics }) {
  const series = useSeries(s.siteId, s.lat, s.lon, s.landing, 14, 30)
  const horizon = useHorizon(s.siteId, s.mask, s.terrain)
  const m = useMemo(() => metricsAt(series, 0, horizon, 14), [series, horizon])
  const v = verdict(m, useWords())
  onMetrics?.(s.key, m)
  return (
    <tr>
      <td>
        <button className="link" onClick={() => onLoad(s)}>{s.label}</button>
        <div className="muted mono small">{s.lat.toFixed(2)}°, {s.lon.toFixed(2)}°E{s.mask ? ` · +${s.mask}° margin` : ''}</div>
      </td>
      <td className="mono small">{fmtUTC(s.landing.getTime())}</td>
      <td><span className={`pill ${v.cls}`}>{v.text}</span></td>
      <td className="mono">{fmtDeg(m.sunEl)}</td>
      <td className="mono">{m.sunUp ? '↓ ' : '↑ '}{formatDuration(m.sunFlipHours) ?? '> 14 d'}</td>
      <td className="mono">{fmtDeg(m.earthEl)}</td>
      <td className="mono">{m.earthUp ? '↓ ' : '↑ '}{formatDuration(m.earthFlipHours) ?? '> 14 d'}</td>
      <td className="mono">{Math.round(m.sunPct)}%</td>
      <td className="mono">{Math.round(m.earthPct)}%</td>
      <td className="mono"><b>{Math.round(m.bothPct)}%</b></td>
      <td><button className="icon" aria-label={`Remove ${s.label}`} onClick={() => onRemove(s.key)}>×</button></td>
    </tr>
  )
}

export function Compare({ scenarios, onRemove, onLoad, onAdd }) {
  const metrics = useRef({})
  const exportCsv = () => {
    const head = 'scenario,lat,lon,landing_utc,margin_deg,status,sun_el_deg,sun_up,sun_flip_h,earth_el_deg,earth_up,earth_flip_h,sun_pct_14d,earth_pct_14d,both_pct_14d,longest_night_h'
    const rows = scenarios.map((s) => {
      const m = metrics.current[s.key]
      if (!m) return null
      return [JSON.stringify(s.label), s.lat, s.lon, s.landing.toISOString(), s.mask, JSON.stringify(verdict(m).text),
        m.sunEl.toFixed(3), m.sunUp ? 1 : 0, m.sunFlipHours?.toFixed(1) ?? '', m.earthEl.toFixed(3), m.earthUp ? 1 : 0,
        m.earthFlipHours?.toFixed(1) ?? '', m.sunPct.toFixed(1), m.earthPct.toFixed(1), m.bothPct.toFixed(1), m.longestDarkHours.toFixed(1)].join(',')
    }).filter(Boolean)
    downloadText('lunar-scenario-comparison.csv', [head, ...rows].join('\n'))
  }
  return (
    <div className="panel" id="compare-panel">
      <div className="panel-head">
        <h2>Scenario comparison</h2>
        <Info>Pin site + date combinations to compare them side by side. Values are at landing time; percentages cover the first 14 days.</Info>
        <div className="tools">
          <button className="primary" onClick={onAdd}>+ Pin current scenario</button>
          {scenarios.length > 0 && <button className="no-print" onClick={exportCsv}>Export CSV</button>}
        </div>
      </div>
      {scenarios.length === 0 ? (
        <p className="empty">Nothing pinned yet. Try pinning the same site on two dates a week apart: the difference is usually dramatic.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Scenario</th><th>Landing (UTC)</th><th>Status</th><th>Sun el.</th><th>Sun set/rise</th>
                <th>Earth el.</th><th>Earth set/rise</th><th>Sun 14 d</th><th>Earth 14 d</th><th>Both</th><th />
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <CompareRow key={s.key} s={s} onRemove={onRemove} onLoad={onLoad} onMetrics={(k, m) => { metrics.current[k] = m }} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Explain title="Why compare?" links={[{ id: 'planner-panel', label: 'Date planner' }, { id: 'map-panel', label: 'Map' }]}>
        <p>Real missions rarely launch on the first planned day: rockets get delayed, hardware is late. When that happens, engineers must quickly check backup dates and nearby sites. Pin a few options here to see which plan still gives power and contact.</p>
      </Explain>
    </div>
  )
}

export function MoonVsEarth({ lat, m }) {
  const earthNoon = 90 - Math.abs(lat) + 23.44
  return (
    <div className="panel" id="facts-panel">
      <div className="panel-head">
        <h2>Why the Moon is different</h2>
      </div>
      <div className="facts">
        <div className="fact">
          <div className="big mono">29.5 d</div>
          <p>One lunar day (Sun to Sun). Sunlight and darkness each last about two Earth weeks near the equator.</p>
        </div>
        <div className="fact">
          <div className="big mono">{fmtDeg(m.maxSunEl, 1)} <span className="vs">vs {fmtDeg(Math.min(90, earthNoon), 0)}</span></div>
          <p>Highest Sun in the next {m.windowDays} days here, vs. the highest midsummer Sun at the same latitude on Earth.
            The Moon's axis is tilted only 1.5°, so polar Sun stays on the horizon all year.</p>
        </div>
        <div className="fact">
          <div className="big mono">0°</div>
          <p>Atmospheric refraction. On Earth the air lifts the Sun by about 0.6° at the horizon and gives twilight. On the Moon the horizon is purely geometric, and it's either full sun or black shadow.</p>
        </div>
        <div className="fact">
          <div className="big mono">±7°</div>
          <p>How much libration swings Earth around in the lunar sky. From the poles and limb sites it slowly rises and sets, which is why direct-to-Earth comm windows come and go over weeks.</p>
        </div>
        <div className="fact">
          <div className="big mono">{(2 * SUN_RADIUS_DEG).toFixed(2)}° / {(2 * EARTH_RADIUS_DEG).toFixed(1)}°</div>
          <p>Apparent diameter of the Sun and of Earth from the Moon. Earth looks almost 4× wider than the Sun does.</p>
        </div>
        <div className="fact">
          <div className="big mono">−170…+120 °C</div>
          <p>Typical surface temperature swing between lunar night and day. Losing sunlight means losing heat as well as power.</p>
        </div>
      </div>
    </div>
  )
}


const REPO_URL = 'https://github.com/Shyvve/NASA-Space-Apps-Challenge'

/**
 * Terrain source for the current site. Curated sites have precomputed full-resolution profiles.
 * Custom coordinates: quick mode in the browser (automatic), precise mode in the downloaded version (one click).
 */
export function TerrainPanel({ siteId, lat, lon, info, state, localPrecise, onQuick, onPrecise }) {
  if (siteId !== 'custom') {
    return (
      <div className="panel terrain" id="terrain-panel">
        <div className="terrain-head">
          <h3>Terrain</h3>
          <span className="muted small">{info ? `LOLA · ${info.resolutionM} m/px` : 'loading…'}</span>
          <Info label="About the terrain">Full-resolution horizon from NASA's LOLA laser altimeter, precomputed for this site and ray-traced 300 km in every direction.</Info>
        </div>
      </div>
    )
  }
  const busy = ['loading', 'computing', 'downloading', 'precise'].includes(state.status)
  return (
    <div className="panel terrain" id="terrain-panel">
      <div className="terrain-head">
        <h3>Terrain</h3>
        <Info label="About the terrain">
          {info?.mode === 'quick' && !busy && <>Quick mode, computed in your browser. Accuracy {quickAccuracy(lat)}. </>}
          {localPrecise
            ? 'Precise mode uses full-resolution NASA LOLA maps (80 m near the pole); the first run downloads them.'
            : 'The downloaded version of the app computes terrain from full-resolution NASA maps (80 m) with one click.'}
        </Info>
      </div>
      {state.status === 'error' && <p className="warn small" role="alert">Terrain failed: {state.error}</p>}
      <div className={`terrain-status ${busy ? 'loading' : info ? info.mode : 'idle'}`}>
        {state.status === 'loading' && <>Downloading map tiles… {state.done}/{state.total} ({(state.bytes / 1e6).toFixed(1)} MB)</>}
        {state.status === 'computing' && <>Calculating the horizon…</>}
        {state.status === 'precise' && <>Calculating the precise horizon…</>}
        {state.status === 'downloading' && <>Downloading NASA map {state.file}: {state.pct}% (first time only)</>}
        {!busy && !info && <>Flat horizon (no terrain yet)</>}
        {!busy && info && (
          <>
            <b>{info.mode === 'precise' ? 'Precise' : 'Quick'}</b> · {info.resolutionM} m/px at the site · surface{' '}
            {info.elevationM.toLocaleString('en-US')} m
          </>
        )}
      </div>
      <div className="terrain-actions">
        {localPrecise ? (
          <button className="primary" disabled={busy || info?.mode === 'precise'} onClick={onPrecise}>
            {info?.mode === 'precise' ? '✓ Precise terrain' : 'Make it precise'}
          </button>
        ) : (
          <a className="btn" href={`${REPO_URL}#run-it-on-your-computer`} target="_blank" rel="noreferrer">
            Precise mode: download the app
          </a>
        )}
        {info?.mode === 'precise' && <button disabled={busy} onClick={onQuick}>Back to quick</button>}
      </div>
    </div>
  )
}
