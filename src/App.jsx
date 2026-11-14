import { useEffect, useMemo, useState } from 'react'
import { SITES, findSite } from './data/sites.js'
import { metricsAt } from './lib/scenario.js'
import { useSeries } from './lib/useSeries.js'
import { Panorama, Timeline } from './components/Charts.jsx'
import { Compare, DatePlanner, MetricCards, MoonVsEarth, SitePicker, fmtUTC } from './components/Panels.jsx'

const DAYS = 30
const STEP_MIN = 30
const HOUR = 3600000

function startOfUTCHour(d) {
  const t = new Date(d)
  t.setUTCMinutes(0, 0, 0)
  return t
}

export default function App() {
  const [siteId, setSiteId] = useState('connecting-ridge')
  const [coords, setCoords] = useState(() => {
    const s = findSite('connecting-ridge')
    return { lat: s.lat, lon: s.lon }
  })
  const [landing, setLanding] = useState(() => startOfUTCHour(new Date()))
  const [index, setIndex] = useState(0)
  const [mask, setMask] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [scenarios, setScenarios] = useState([])

  const site = findSite(siteId)
  const series = useSeries(siteId, coords.lat, coords.lon, landing, DAYS, STEP_MIN)
  const m = useMemo(() => metricsAt(series, index, mask, 14), [series, index, mask])
  const now = series.t[index]

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setIndex((i) => (i + 2) % series.t.length), 40)
    return () => clearInterval(id)
  }, [playing, series.t.length])

  const chooseSite = (id) => {
    setSiteId(id)
    const s = findSite(id)
    if (s) setCoords({ lat: s.lat, lon: s.lon })
  }
  const setCustomCoords = (lat, lon) => {
    setSiteId('custom')
    setCoords({ lat: Math.max(-90, Math.min(90, lat || 0)), lon: lon || 0 })
  }
  const chooseLanding = (d) => {
    setLanding(d)
    setIndex(0)
  }
  const pin = () => {
    const at = new Date(now)
    setScenarios((list) => [
      ...list,
      {
        key: `${Date.now()}-${Math.random()}`,
        label: site ? site.name : 'Custom site',
        siteId, lat: coords.lat, lon: coords.lon, landing: at, mask,
      },
    ])
  }
  const loadScenario = (s) => {
    setSiteId(s.siteId)
    setCoords({ lat: s.lat, lon: s.lon })
    setMask(s.mask)
    chooseLanding(s.landing)
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
            <circle cx="16" cy="16" r="13" fill="#d9d4c7" />
            <circle cx="11" cy="12" r="3" fill="#b5ae9e" />
            <circle cx="20" cy="19" r="4" fill="#b5ae9e" />
          </svg>
          <div>
            <h1>Lunar Landing Site Navigator</h1>
            <p>Where and when to land so you keep power and a line to Earth.</p>
          </div>
        </div>
        <div className="site-chip">
          <b>{site ? site.name : 'Custom site'}</b>
          <span className="mono">{coords.lat.toFixed(2)}°, {coords.lon.toFixed(2)}°E</span>
          {site && <span className="muted">{site.note}</span>}
        </div>
      </header>

      <main className="layout">
        <aside>
          <SitePicker
            siteId={siteId} lat={coords.lat} lon={coords.lon}
            onSite={chooseSite} onCoords={setCustomCoords}
            landing={landing} onLanding={chooseLanding}
            mask={mask} onMask={setMask}
          />
          <div className="panel quick">
            <h3>Quick picks</h3>
            <div className="chips">
              {['apollo11', 'im1', 'chandrayaan3', 'shackleton', 'malapert', 'change4'].map((id) => (
                <button key={id} className={id === siteId ? 'chip on' : 'chip'} onClick={() => chooseSite(id)}>
                  {findSite(id).name}
                </button>
              ))}
            </div>
            <p className="muted small">{SITES.length} curated sites have JPL Horizons data for Nov 2026 to Dec 2027. Custom coordinates and other dates are computed in the browser.</p>
          </div>
        </aside>

        <section className="content">
          <MetricCards m={m} source={series.sources.includes('horizons') ? 'horizons' : 'engine'} />

          <div className="panel">
            <div className="panel-head">
              <h2>Sky at the site</h2>
              <p>
                Full 360° view of the horizon at <b className="mono">{fmtUTC(now)}</b>. The faint lines are the paths of the Sun and Earth over the next {DAYS} days.
              </p>
            </div>
            <Panorama series={series} index={index} mask={mask} />
            <div className="legend">
              <span><i className="dot-ico sun" /> Sun</span>
              <span><i className="dot-ico earth" /> Earth</span>
              <span><i className="dot-ico ground" /> Below horizon: no power / no direct link</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Mission timeline</h2>
              <p>Elevation over {DAYS} days after landing. Drag across the chart to move in time.</p>
              <div className="transport">
                <button className="primary" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
                <button onClick={() => setIndex((i) => Math.max(0, i - 2 * (60 / STEP_MIN) * 6))}>−12 h</button>
                <button onClick={() => setIndex((i) => Math.min(series.t.length - 1, i + 2 * (60 / STEP_MIN) * 6))}>+12 h</button>
                <button onClick={() => setIndex(0)}>Landing</button>
                <span className="mono muted">T+{((now - landing.getTime()) / HOUR / 24).toFixed(1)} d</span>
              </div>
            </div>
            <Timeline series={series} index={index} mask={mask} onScrub={(k) => { setPlaying(false); setIndex(k) }} start={landing} />
          </div>

          <DatePlanner siteId={siteId} lat={coords.lat} lon={coords.lon} landing={landing} onPick={chooseLanding} mask={mask} />

          <Compare scenarios={scenarios} onAdd={pin} onLoad={loadScenario}
            onRemove={(key) => setScenarios((l) => l.filter((s) => s.key !== key))} />

          <MoonVsEarth lat={coords.lat} m={m} />

          <footer className="foot">
            <p>
              Ephemerides: <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">JPL Horizons</a> (DE441, airless apparent, pre-downloaded for curated sites)
              and an in-browser model (astronomy-engine + IAU lunar rotation model with libration), which agrees with Horizons to within 0.004° (RMS 0.001°) across all curated sites.
              Terrain: geometric horizon plus a uniform mask. Per-azimuth LOLA horizon masks are the next step.
              Site coordinates for south pole candidate regions are approximate.
            </p>
            <p>Built for the NASA Space Apps Challenge 2026: Lunar Landing Site Navigator.</p>
          </footer>
        </section>
      </main>
    </div>
  )
}
