import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SITES, findSite } from './data/sites.js'
import { clearances, metricsAt } from './lib/scenario.js'
import { useHorizon, useSeries } from './lib/useSeries.js'
import { parseTerrainFile, quickTerrain } from './lib/quickTerrain.js'
import { Panorama, Timeline } from './components/Charts.jsx'
import { Compare, DatePlanner, MetricCards, MoonVsEarth, SitePicker, TerrainPanel, fmtUTC } from './components/Panels.jsx'

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

  // Terrain for custom coordinates: quick (browser tiles) or precise (imported from the offline kit).
  const [customTerrain, setCustomTerrain] = useState(null)
  const [terrainState, setTerrainState] = useState({ status: 'idle' })
  const terrainRun = useRef(0)

  const runQuickTerrain = useCallback((lat, lon) => {
    const run = ++terrainRun.current
    setTerrainState({ status: 'loading', done: 0, total: 0, bytes: 0 })
    quickTerrain(lat, lon, (done, total, bytes) => {
      if (run === terrainRun.current) setTerrainState({ status: done === total ? 'computing' : 'loading', done, total, bytes })
    })
      .then((t) => {
        if (run !== terrainRun.current) return
        setCustomTerrain(t)
        setTerrainState({ status: 'ready' })
      })
      .catch((e) => run === terrainRun.current && setTerrainState({ status: 'error', error: e.message }))
  }, [])

  // Auto-run quick terrain (debounced) whenever custom coordinates change, unless a precise profile for them is loaded.
  useEffect(() => {
    if (siteId !== 'custom') return
    const same = customTerrain && Math.abs(customTerrain.site.lat - coords.lat) < 1e-6 && Math.abs(customTerrain.site.lon - coords.lon) < 1e-6
    if (same) return
    const id = setTimeout(() => runQuickTerrain(coords.lat, coords.lon), 600)
    return () => clearTimeout(id)
  }, [siteId, coords.lat, coords.lon, customTerrain, runQuickTerrain])

  const importTerrain = (text) => {
    try {
      const t = parseTerrainFile(text)
      terrainRun.current++ // cancel any quick run in flight
      setSiteId('custom')
      setCoords({ lat: t.site.lat, lon: t.site.lon })
      setCustomTerrain(t)
      setTerrainState({ status: 'ready' })
    } catch (e) {
      setTerrainState({ status: 'error', error: e.message })
    }
  }

  const site = findSite(siteId)
  const series = useSeries(siteId, coords.lat, coords.lon, landing, DAYS, STEP_MIN)
  const horizon = useHorizon(siteId, mask, siteId === 'custom' ? customTerrain : null)
  const clr = useMemo(() => clearances(series, horizon), [series, horizon])
  const m = useMemo(() => metricsAt(series, index, horizon, 14, clr), [series, index, horizon, clr])
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
        terrain: siteId === 'custom' ? customTerrain : null,
      },
    ])
  }
  const loadScenario = (s) => {
    setSiteId(s.siteId)
    setCoords({ lat: s.lat, lon: s.lon })
    setMask(s.mask)
    if (s.terrain) setCustomTerrain(s.terrain)
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
          {horizon.info && <span className="muted small">Surface {horizon.info.elevationM.toLocaleString('en-US')} m · LOLA {horizon.info.resolutionM} m/px terrain</span>}
        </div>
      </header>

      <main className="layout">
        <aside>
          <SitePicker
            siteId={siteId} lat={coords.lat} lon={coords.lon}
            onSite={chooseSite} onCoords={setCustomCoords}
            landing={landing} onLanding={chooseLanding}
            mask={mask} onMask={setMask} terrain={horizon.info}
          />
          <TerrainPanel siteId={siteId} lat={coords.lat} lon={coords.lon} info={horizon.info}
            state={terrainState} onQuick={() => runQuickTerrain(coords.lat, coords.lon)} onImport={importTerrain} />
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
            <Panorama series={series} index={index} horizon={horizon} />
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
            <Timeline series={series} index={index} horizon={horizon} clr={clr} onScrub={(k) => { setPlaying(false); setIndex(k) }} start={landing} />
          </div>

          <DatePlanner siteId={siteId} lat={coords.lat} lon={coords.lon} landing={landing} onPick={chooseLanding} horizon={horizon} />

          <Compare scenarios={scenarios} onAdd={pin} onLoad={loadScenario}
            onRemove={(key) => setScenarios((l) => l.filter((s) => s.key !== key))} />

          <MoonVsEarth lat={coords.lat} m={m} />

          <footer className="foot">
            <p>
              Ephemerides: <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">JPL Horizons</a> (DE441, airless apparent, pre-downloaded for curated sites)
              and an in-browser model (astronomy-engine + IAU lunar rotation model with libration), which agrees with Horizons to within 0.004° (RMS 0.001°) across all curated sites.
              Terrain: horizon profiles ray-traced to 300 km through <a href="https://pds-geosciences.wustl.edu/missions/lro/lola.htm" target="_blank" rel="noreferrer">LOLA</a> DEMs
              (80 m and 240 m south polar, 1.9 km global), observer 2 m above ground. Custom coordinates use a flat horizon.
              Shackleton rim, Malapert and Nobile are the best-lit LOLA points near those features; NASA does not publish center points for Artemis III regions.
            </p>
            <p>Built for the NASA Space Apps Challenge 2026: Lunar Landing Site Navigator.</p>
          </footer>
        </section>
      </main>
    </div>
  )
}
