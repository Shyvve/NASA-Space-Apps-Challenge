import { useMemo } from 'react'
import { SITES } from '../data/sites.js'
import { EARTH_RADIUS_DEG, SUN_RADIUS_DEG, formatDuration, metricsAt } from '../lib/scenario.js'
import { useSeries } from '../lib/useSeries.js'

const DAY = 86400000
const groups = [...new Set(SITES.map((s) => s.group))]

export const fmtDeg = (v, d = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}°`
export const fmtUTC = (ms) =>
  new Date(ms).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC'
const toInput = (d) => d.toISOString().slice(0, 16)

export function verdict(m) {
  if (m.sunUp && m.earthUp) return { cls: 'go', text: 'Power + direct-to-Earth link' }
  if (m.sunUp) return { cls: 'warn', text: 'Power only — no Earth in view' }
  if (m.earthUp) return { cls: 'warn', text: 'Comms only — Sun below horizon' }
  return { cls: 'nogo', text: 'No power, no direct comms' }
}

export function SitePicker({ siteId, lat, lon, onSite, onCoords, landing, onLanding, mask, onMask }) {
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
        <span>Local terrain horizon: <b>{mask.toFixed(1)}°</b></span>
        <input type="range" min="0" max="5" step="0.1" value={mask} onChange={(e) => onMask(Number(e.target.value))} />
        <small>Raise it to model nearby ridges and crater walls. Near the south pole even 1–2° of terrain can cut sunlight by days.</small>
      </label>
    </div>
  )
}

export function MetricCards({ m, source }) {
  const v = verdict(m)
  const sunFlip = formatDuration(m.sunFlipHours)
  const earthFlip = formatDuration(m.earthFlipHours)
  return (
    <div className="cards">
      <div className={`card verdict ${v.cls}`}>
        <div className="label">Status at this moment</div>
        <div className="big">{v.text}</div>
        <div className="sub">
          Data: {source === 'horizons' ? 'JPL Horizons (DE441)' : 'computed in browser (IAU Moon model)'}
        </div>
      </div>
      <div className="card">
        <div className="label"><i className="dot-ico sun" /> Solar elevation</div>
        <div className="big mono">{fmtDeg(m.sunEl)}</div>
        <div className="sub">az {m.sunAz.toFixed(1)}° · disk {Math.round(m.diskFraction * 100)}% visible</div>
        <div className={`countdown ${m.sunUp ? 'up' : 'down'}`}>
          {m.sunUp ? 'Sunset in ' : 'Sunrise in '}<b>{sunFlip ?? `> ${m.windowDays} d`}</b>
        </div>
      </div>
      <div className="card">
        <div className="label"><i className="dot-ico earth" /> Earth elevation</div>
        <div className="big mono">{fmtDeg(m.earthEl)}</div>
        <div className="sub">az {m.earthAz.toFixed(1)}°</div>
        <div className={`countdown ${m.earthUp ? 'up' : 'down'}`}>
          {m.earthUp ? 'Earthset in ' : 'Earthrise in '}<b>{earthFlip ?? `> ${m.windowDays} d`}</b>
        </div>
      </div>
      <div className="card">
        <div className="label">Next {m.windowDays} days</div>
        <Bar label="Sunlight" pct={m.sunPct} cls="sun" />
        <Bar label="Earth in view" pct={m.earthPct} cls="earth" />
        <Bar label="Both" pct={m.bothPct} cls="both" />
        <div className="sub">Longest night {formatDuration(m.longestDarkHours) || '0 h'} · peak Sun {fmtDeg(m.maxSunEl, 1)}</div>
      </div>
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
export function DatePlanner({ siteId, lat, lon, landing, onPick, mask }) {
  const planStart = useMemo(() => {
    const d = new Date(landing)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  }, [landing.getUTCFullYear(), landing.getUTCMonth()])
  const DAYS = 120, WIN = 14
  const series = useSeries(siteId, lat, lon, planStart, DAYS + WIN, 60)
  const rows = useMemo(() => {
    const out = []
    for (let d = 0; d < DAYS; d++) {
      const m = metricsAt(series, d * 24, mask, WIN)
      out.push({ d, sun: m.sunPct, earth: m.earthPct, both: m.bothPct })
    }
    return out
  }, [series, mask])
  const landingDay = Math.floor((landing.getTime() - planStart.getTime()) / DAY)
  const best = rows.reduce((a, b) => (b.both > a.both ? b : a), rows[0])
  const cell = (pct, kind) => ({ background: `color-mix(in oklab, var(--${kind}) ${Math.round(pct)}%, var(--cell-empty))` })
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Landing date planner</h2>
        <p>
          Each column is a landing day; color shows how much of the following {WIN} days have Sun, Earth or both in view.
          Click a day to load it. Best day in range for power + comms:{' '}
          <button className="link" onClick={() => onPick(new Date(planStart.getTime() + best.d * DAY))}>
            {new Date(planStart.getTime() + best.d * DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
            {' '}({Math.round(best.both)}%)
          </button>
        </p>
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
    </div>
  )
}

function CompareRow({ s, onRemove, onLoad }) {
  const series = useSeries(s.siteId, s.lat, s.lon, s.landing, 14, 30)
  const m = useMemo(() => metricsAt(series, 0, s.mask, 14), [series, s.mask])
  const v = verdict(m)
  return (
    <tr>
      <td>
        <button className="link" onClick={() => onLoad(s)}>{s.label}</button>
        <div className="muted mono small">{s.lat.toFixed(2)}°, {s.lon.toFixed(2)}°E{s.mask ? ` · mask ${s.mask}°` : ''}</div>
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
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Scenario comparison</h2>
        <p>Pin site + date combinations to compare them side by side. Values are at landing time; percentages cover the first 14 days.</p>
        <button className="primary" onClick={onAdd}>+ Pin current scenario</button>
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
                <CompareRow key={s.key} s={s} onRemove={onRemove} onLoad={onLoad} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function MoonVsEarth({ lat, m }) {
  const earthNoon = 90 - Math.abs(lat) + 23.44
  return (
    <div className="panel">
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
