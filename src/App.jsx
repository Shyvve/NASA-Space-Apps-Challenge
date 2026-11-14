import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SITES, findSite } from './data/sites.js'
import { clearances, commsMetrics, metricsAt, relayClearance } from './lib/scenario.js'
import { RELAYS, relaySeries } from './lib/relay.js'
import { RelayPanel } from './components/Relay.jsx'
import { useHorizon, useSeries } from './lib/useSeries.js'
import { hasLocalPrecise, preciseTerrain, quickTerrain } from './lib/quickTerrain.js'
import { exportSeriesCSV, printReport } from './lib/export.js'
import { Explain, LearnContext } from './lib/learn.jsx'
import { Panorama, Timeline } from './components/Charts.jsx'
import { Compare, DatePlanner, MetricCards, MoonVsEarth, SitePicker, TerrainPanel, fmtUTC, verdict } from './components/Panels.jsx'
import { MoonMap } from './components/MoonMap.jsx'
import { IllumMap } from './components/IllumMap.jsx'
import { PowerPanel, powerSeries } from './components/Power.jsx'
import { Scene3D } from './components/Scene3D.jsx'
import { Tour } from './components/Tour.jsx'

const DAYS = 30
const STEP_MIN = 30
const HOUR = 3600000
const REPO_URL = 'https://github.com/Shyvve/NASA-Space-Apps-Challenge'

function startOfUTCHour(d) {
  const t = new Date(d)
  t.setUTCMinutes(0, 0, 0)
  return t
}

// ---- Shareable state in the URL: ?site=..&lat=..&lon=..&t=..&m=..&i=..&learn=1 ----
function readUrl() {
  const q = new URLSearchParams(location.search)
  const out = {}
  const site = q.get('site')
  if (site && (site === 'custom' || findSite(site))) out.siteId = site
  const lat = Number(q.get('lat')), lon = Number(q.get('lon'))
  if (out.siteId === 'custom' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90) out.coords = { lat, lon }
  if (out.siteId && out.siteId !== 'custom') {
    const s = findSite(out.siteId)
    out.coords = { lat: s.lat, lon: s.lon }
  }
  const t = q.get('t') && new Date(q.get('t'))
  if (t && !Number.isNaN(t.getTime())) out.landing = t
  const m = Number(q.get('m'))
  if (q.has('m') && Number.isFinite(m)) out.mask = Math.max(0, Math.min(5, m))
  const i = Number(q.get('i'))
  if (q.has('i') && Number.isInteger(i) && i >= 0) out.index = i
  if (q.get('learn') === '1') out.learn = true
  if (RELAYS[q.get('relay')]) out.relay = q.get('relay')
  return out
}
const initial = readUrl()

export default function App() {
  const [siteId, setSiteId] = useState(initial.siteId ?? 'connecting-ridge')
  const [coords, setCoords] = useState(() => initial.coords ?? { lat: findSite('connecting-ridge').lat, lon: findSite('connecting-ridge').lon })
  const [landing, setLanding] = useState(() => initial.landing ?? startOfUTCHour(new Date()))
  const [index, setIndex] = useState(initial.index ?? 0)
  const [mask, setMask] = useState(initial.mask ?? 0)
  const [playing, setPlaying] = useState(false)
  const [scenarios, setScenarios] = useState([])
  const [learn, setLearn] = useState(initial.learn ?? false)
  const [tour, setTour] = useState(false)
  const [toast, setToast] = useState(null)
  const [powerCfg, setPowerCfg] = useState({ area: 2, eff: 30, mount: 'tracking', facing: 0, load: 60 })
  const [relayId, setRelayId] = useState(initial.relay ?? 'none')
  const w = (expert, simple) => (learn ? simple : expert)

  // ---- Terrain for custom coordinates: quick (browser tiles) or precise (local version, full-resolution DEMs) ----
  const [customTerrain, setCustomTerrain] = useState(null)
  const [terrainState, setTerrainState] = useState({ status: 'idle' })
  const [localPrecise, setLocalPrecise] = useState(false)
  const terrainRun = useRef(0)
  useEffect(() => { hasLocalPrecise().then(setLocalPrecise) }, [])

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

  const runPreciseTerrain = (lat, lon) => {
    const run = ++terrainRun.current
    setTerrainState({ status: 'precise' })
    preciseTerrain(lat, lon, (job) => {
      if (run === terrainRun.current) setTerrainState(job.status === 'downloading' ? { status: 'downloading', file: job.file, pct: job.pct } : { status: 'precise' })
    })
      .then((t) => {
        if (run !== terrainRun.current) return
        setCustomTerrain(t)
        setTerrainState({ status: 'ready' })
      })
      .catch((e) => run === terrainRun.current && setTerrainState({ status: 'error', error: e.message }))
  }

  // Quick terrain runs automatically (debounced) whenever custom coordinates change.
  useEffect(() => {
    if (siteId !== 'custom') return
    const same = customTerrain && Math.abs(customTerrain.site.lat - coords.lat) < 1e-6 && Math.abs(customTerrain.site.lon - coords.lon) < 1e-6
    if (same) return
    const id = setTimeout(() => runQuickTerrain(coords.lat, coords.lon), 600)
    return () => clearTimeout(id)
  }, [siteId, coords.lat, coords.lon, customTerrain, runQuickTerrain])

  // ---- Core computation ----
  const site = findSite(siteId)
  const series = useSeries(siteId, coords.lat, coords.lon, landing, DAYS, STEP_MIN)
  const terrainForSite = siteId === 'custom' && customTerrain && Math.abs(customTerrain.site.lat - coords.lat) < 1e-6 && Math.abs(customTerrain.site.lon - coords.lon) < 1e-6 ? customTerrain : null
  const horizon = useHorizon(siteId, mask, terrainForSite)
  const clr = useMemo(() => clearances(series, horizon), [series, horizon])
  const safeIndex = Math.min(index, series.t.length - 1)
  const relay = useMemo(() => relaySeries(relayId, coords.lat, coords.lon, series.t), [relayId, coords.lat, coords.lon, series])
  const relayClr = useMemo(() => relayClearance(relay, horizon), [relay, horizon])
  const comms = useMemo(() => commsMetrics(clr, relayClr, safeIndex, STEP_MIN, 14), [clr, relayClr, safeIndex])
  const m = useMemo(() => ({ ...metricsAt(series, safeIndex, horizon, 14, clr), viaRelay: comms.viaRelay }), [series, safeIndex, horizon, clr, comms.viaRelay])
  const power = useMemo(() => powerSeries(series, clr, powerCfg), [series, clr, powerCfg])
  const now = series.t[safeIndex]

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setIndex((i) => (i + 2) % series.t.length), 40)
    return () => clearInterval(id)
  }, [playing, series.t.length])

  // ---- Keep the URL in sync so any view can be shared ----
  useEffect(() => {
    const q = new URLSearchParams()
    q.set('site', siteId)
    if (siteId === 'custom') {
      q.set('lat', String(coords.lat))
      q.set('lon', String(coords.lon))
    }
    q.set('t', landing.toISOString().slice(0, 16) + 'Z')
    if (mask) q.set('m', String(mask))
    if (safeIndex) q.set('i', String(safeIndex))
    if (learn) q.set('learn', '1')
    if (relayId !== 'none') q.set('relay', relayId)
    const id = setTimeout(() => history.replaceState(null, '', `${location.pathname}?${q}`), 300)
    return () => clearTimeout(id)
  }, [siteId, coords.lat, coords.lon, landing, mask, safeIndex, learn, relayId])

  const flash = (text) => {
    setToast(text)
    setTimeout(() => setToast(null), 2200)
  }
  const shareLink = () => {
    navigator.clipboard?.writeText(location.href).then(() => flash('Link copied: anyone who opens it sees this exact view'), () => flash(location.href))
  }

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
    setScenarios((list) => [
      ...list,
      {
        key: `${Date.now()}-${Math.random()}`,
        label: site ? site.name : `Custom ${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)}`,
        siteId, lat: coords.lat, lon: coords.lon, landing: new Date(now), mask,
        terrain: siteId === 'custom' ? terrainForSite : null,
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
  const label = site ? site.name : 'Custom site'

  return (
    <LearnContext.Provider value={learn}>
      <div className={`app ${learn ? 'learn' : ''}`}>
        <header className="top">
          <div className="brand">
            <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
              <circle cx="16" cy="16" r="13" fill="#d9d4c7" />
              <circle cx="11" cy="12" r="3" fill="#b5ae9e" />
              <circle cx="20" cy="19" r="4" fill="#b5ae9e" />
            </svg>
            <div>
              <h1>Lunar Landing Site Navigator</h1>
              <p>{w('Where and when to land so you keep power and a line to Earth.', 'Find a place and a day on the Moon where a lander gets sunlight and can call home.')}</p>
            </div>
          </div>
          <div className="tools">
            <div className="seg" role="group" aria-label="Explanation level">
              <button className={!learn ? 'on' : ''} onClick={() => setLearn(false)}>Expert</button>
              <button className={learn ? 'on' : ''} onClick={() => setLearn(true)}>Learn</button>
            </div>
            <button onClick={() => { setLearn(true); setTour(true) }}>Take the tour</button>
            <button onClick={shareLink}>Share link</button>
            <button onClick={() => exportSeriesCSV({ label, lat: coords.lat, lon: coords.lon, series, clr, horizon, power, relay, relayClr })}>Export CSV</button>
            <button onClick={printReport}>Print / PDF</button>
            <a className="btn" href={REPO_URL} target="_blank" rel="noreferrer">⬇ Download app</a>
          </div>
        </header>

        <div className="print-only report-head">
          <h2>{label} · {coords.lat.toFixed(4)}°, {coords.lon.toFixed(4)}°E</h2>
          <p>Landing {fmtUTC(landing.getTime())} · shown at {fmtUTC(now)} · status: {verdict(m).text}</p>
        </div>

        <main className="layout">
          <aside>
            <SitePicker
              siteId={siteId} lat={coords.lat} lon={coords.lon}
              onSite={chooseSite} onCoords={setCustomCoords}
              landing={landing} onLanding={chooseLanding}
              mask={mask} onMask={setMask} terrain={horizon.info}
            />
            <TerrainPanel siteId={siteId} lat={coords.lat} lon={coords.lon} info={horizon.info} state={terrainState}
              localPrecise={localPrecise} onQuick={() => runQuickTerrain(coords.lat, coords.lon)} onPrecise={() => runPreciseTerrain(coords.lat, coords.lon)} />
            <div className="panel quick">
              <h3>Quick picks</h3>
              <div className="chips">
                {['apollo11', 'im1', 'chandrayaan3', 'shackleton', 'malapert', 'change4'].map((id) => (
                  <button key={id} className={id === siteId ? 'chip on' : 'chip'} onClick={() => chooseSite(id)}>
                    {findSite(id).name}
                  </button>
                ))}
              </div>
              <p className="muted small">{SITES.length} curated sites have JPL Horizons data for Nov 2026 to Dec 2027. Other dates and points are computed in the browser.</p>
            </div>
          </aside>

          <section className="content">
            <div className="site-line">
              <b>{label}</b>
              <span className="mono">{coords.lat.toFixed(4)}°, {coords.lon.toFixed(4)}°E</span>
              {site && <span className="muted">{site.note}</span>}
              {horizon.info && <span className="muted small">Surface {horizon.info.elevationM.toLocaleString('en-US')} m</span>}
            </div>

            <MetricCards m={m} source={series.sources.includes('horizons') ? 'horizons' : 'engine'} />

            <MoonMap lat={coords.lat} lon={coords.lon} siteId={siteId} onPick={setCustomCoords} onSite={chooseSite} />

            <div className="panel" id="sky-panel">
              <div className="panel-head">
                <h2>{w('Sky at the site', 'Look around from the lander')}</h2>
                <p>
                  {w('Full 360° view of the horizon at', 'Everything you would see turning around once, at')} <b className="mono">{fmtUTC(now)}</b>.{' '}
                  {w(`The faint lines are the paths of the Sun and Earth over the next ${DAYS} days.`, `The thin lines show where the Sun and Earth will move over the next ${DAYS} days.`)}
                </p>
              </div>
              <Panorama series={series} index={safeIndex} horizon={horizon} relay={relay} />
              <div className="legend">
                <span><i className="dot-ico sun" /> Sun</span>
                <span><i className="dot-ico earth" /> Earth</span>
                {relay && <span><i className="dot-ico relay" /> Relay ({RELAYS[relayId].short})</span>}
                <span><i className="dot-ico ground" /> {w('Below horizon: no power / no direct link', 'Hidden by mountains: no power / no contact')}</span>
              </div>
              <Explain title="How to read this picture" links={[{ id: 'status-cards', label: 'Status' }, { id: 'scene-panel', label: '3D view' }, { id: 'map-panel', label: 'Map' }]}>
                <p>Imagine standing at the landing site and turning around once. Left to right is the direction (N, E, S, W), up is how high in the sky. The grey shape at the bottom is the real outline of the mountains around you.</p>
                <p>On the Moon there is no air, so there is no twilight and no blue sky: if the Sun is above the mountains you have full sunlight, if it dips behind them it is instantly dark.</p>
              </Explain>
            </div>

            <div className="panel" id="timeline-panel">
              <div className="panel-head">
                <h2>{w('Mission timeline', 'What happens over the next month')}</h2>
                <p>{w(`Elevation over ${DAYS} days after landing. Drag across the chart to move in time.`, 'Drag across the chart to travel in time. The coloured bars show when the Sun and Earth are visible.')}</p>
                <div className="transport">
                  <button className="primary" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
                  <button onClick={() => setIndex((i) => Math.max(0, i - 2 * (60 / STEP_MIN) * 6))}>−12 h</button>
                  <button onClick={() => setIndex((i) => Math.min(series.t.length - 1, i + 2 * (60 / STEP_MIN) * 6))}>+12 h</button>
                  <button onClick={() => setIndex(0)}>Landing</button>
                  <span className="mono muted">T+{((now - landing.getTime()) / HOUR / 24).toFixed(1)} d</span>
                </div>
              </div>
              <Timeline series={series} index={safeIndex} horizon={horizon} clr={clr} relayClr={relayClr} onScrub={(k) => { setPlaying(false); setIndex(k) }} start={landing} />
              <Explain title="Why does it change so slowly?" links={[{ id: 'planner-panel', label: 'Date planner' }, { id: 'power-panel', label: 'Power' }]}>
                <p>The Moon spins very slowly: one full day-and-night takes 29.5 Earth days. So the Sun crawls across the sky. The dashed lines are the mountain height in the direction of the Sun and Earth: when a solid line drops below its dashed line, that body is hidden.</p>
              </Explain>
            </div>

            <Scene3D lat={coords.lat} lon={coords.lon} sun={{ az: m.sunAz, el: m.sunEl }} earth={{ az: m.earthAz, el: m.earthEl }} />

            <RelayPanel relayId={relayId} onRelay={setRelayId} relay={relay} clr={clr} relayClr={relayClr} comms={comms} series={series} index={safeIndex} />

            <PowerPanel series={series} clr={clr} index={safeIndex} cfg={powerCfg} onCfg={setPowerCfg} />

            <DatePlanner siteId={siteId} lat={coords.lat} lon={coords.lon} landing={landing} onPick={chooseLanding} horizon={horizon} />

            <IllumMap lat={coords.lat} lon={coords.lon} start={landing} onPick={setCustomCoords} />

            <Compare scenarios={scenarios} onAdd={pin} onLoad={loadScenario}
              onRemove={(key) => setScenarios((l) => l.filter((s) => s.key !== key))} />

            <MoonVsEarth lat={coords.lat} m={m} />

            <footer className="foot">
              <p>
                Ephemerides: <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">JPL Horizons</a> (DE441, airless apparent, pre-downloaded for curated sites)
                and an in-browser model (astronomy-engine + IAU lunar rotation model with libration), which agrees with Horizons to within 0.004° (RMS 0.001°).
                Terrain: horizon profiles ray-traced to 300 km through <a href="https://pds-geosciences.wustl.edu/missions/lro/lola.htm" target="_blank" rel="noreferrer">LOLA</a> DEMs, observer 2 m above ground.
                Shackleton rim, Malapert and Nobile are the best-lit LOLA points near those features; NASA does not publish center points for Artemis III regions.
              </p>
              <p>Built for the NASA Space Apps Challenge 2026: Lunar Landing Site Navigator · <a href={REPO_URL} target="_blank" rel="noreferrer">Source on GitHub</a></p>
            </footer>
          </section>
        </main>
        <Tour open={tour} onClose={() => setTour(false)} />
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </LearnContext.Provider>
  )
}
