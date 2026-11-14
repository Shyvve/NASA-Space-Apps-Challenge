import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SITES, findSite } from './data/sites.js'
import { clearances, commsMetrics, metricsAt, relayClearance } from './lib/scenario.js'
import { RELAYS, relaySeries } from './lib/relay.js'
import { RelayPanel } from './components/Relay.jsx'
import { useHorizon, useSeries } from './lib/useSeries.js'
import { hasLocalPrecise, preciseTerrain, quickTerrain } from './lib/quickTerrain.js'
import { exportSeriesCSV, printReport } from './lib/export.js'
import { Hint, LearnContext } from './lib/learn.jsx'
import { Assistant } from './components/Assistant.jsx'
import { Panorama, Timeline } from './components/Charts.jsx'
import { Compare, DatePlanner, MetricCards, MoonVsEarth, SitePicker, TerrainPanel, fmtUTC, verdict } from './components/Panels.jsx'
import { MoonMap } from './components/MoonMap.jsx'
import { IllumMap } from './components/IllumMap.jsx'
import { PowerPanel, powerSeries } from './components/Power.jsx'
import { Scene3D } from './components/Scene3D.jsx'
import { Tour } from './components/Tour.jsx'
import { CompareModal, CompareTray, MAX_COMPARE } from './components/SiteCompare.jsx'

const DAYS = 30
const STEP_MIN = 30
const HOUR = 3600000
const REPO_URL = 'https://github.com/Shyvve/NASA-Space-Apps-Challenge'
const DEFAULT_POWER = { area: 2, eff: 30, mount: 'tracking', facing: 0, load: 60 }
const PANEL_TAB = { 'scene-panel': '3d', 'relay-panel': 'comms', 'power-panel': 'power', 'planner-panel': 'dates', 'illum-panel': 'light', 'compare-panel': 'compare', 'facts-panel': 'about' }

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
  const [powerCfg, setPowerCfg] = useState(DEFAULT_POWER)
  const [relayId, setRelayId] = useState(initial.relay ?? 'none')
  // Shop-style comparison: the user adds any two places, then opens a side-by-side view.
  const [compareList, setCompareList] = useState([])
  const [compareOpen, setCompareOpen] = useState(false)
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
  const compareKey = `${siteId}:${coords.lat.toFixed(5)},${coords.lon.toFixed(5)}`
  const inCompare = compareList.some((x) => x.key === compareKey)
  const toggleCompare = () => {
    if (inCompare) return setCompareList((l) => l.filter((x) => x.key !== compareKey))
    if (compareList.length >= MAX_COMPARE) return
    const entry = {
      key: compareKey, siteId, lat: coords.lat, lon: coords.lon, note: site?.note,
      label: site ? site.name : `Point ${coords.lat.toFixed(2)}°, ${coords.lon.toFixed(2)}°E`,
      terrain: siteId === 'custom' ? terrainForSite : null,
    }
    const next = [...compareList, entry]
    setCompareList(next)
    if (next.length === MAX_COMPARE) flash('Two places selected: press Compare at the bottom')
  }

  const resetAll = () => {
    terrainRun.current++
    const s = findSite('connecting-ridge')
    setSiteId('connecting-ridge')
    setCoords({ lat: s.lat, lon: s.lon })
    setLanding(startOfUTCHour(new Date()))
    setIndex(0)
    setMask(0)
    setPlaying(false)
    setScenarios([])
    setCompareList([])
    setCompareOpen(false)
    setRelayId('none')
    setPowerCfg(DEFAULT_POWER)
    setCustomTerrain(null)
    setTerrainState({ status: 'idle' })
    setTab('3d')
    flash('Settings reset')
  }

  // Panels on the right live in tabs; links / tour steps ask to reveal a panel by id.
  const [tab, setTab] = useState('3d')
  useEffect(() => {
    const onReveal = (e) => {
      const t = PANEL_TAB[e.detail]
      if (t) setTab(t)
      setTimeout(() => document.getElementById(e.detail)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60)
    }
    window.addEventListener('reveal-panel', onReveal)
    return () => window.removeEventListener('reveal-panel', onReveal)
  }, [])

  const [menu, setMenu] = useState(false)
  useEffect(() => {
    if (!menu) return
    const close = (e) => { if (!e.target.closest('.menu-wrap')) setMenu(false) }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])
  const menuItem = (text, fn) => <button role="menuitem" onClick={() => { setMenu(false); fn() }}>{text}</button>

  const assistantContext = {
    site: label, lat: +coords.lat.toFixed(4), lon: +coords.lon.toFixed(4), note: site?.note,
    landingUTC: landing.toISOString(), viewedUTC: new Date(now).toISOString(),
    status: verdict(m).text, sunElevationDeg: +m.sunEl.toFixed(2), sunAzimuthDeg: +m.sunAz.toFixed(1), terrainHorizonTowardSunDeg: +m.sunHorizon.toFixed(2),
    earthElevationDeg: +m.earthEl.toFixed(2), terrainHorizonTowardEarthDeg: +m.earthHorizon.toFixed(2),
    hoursToSunChange: m.sunFlipHours && +m.sunFlipHours.toFixed(1), hoursToEarthChange: m.earthFlipHours && +m.earthFlipHours.toFixed(1),
    next14days: { sunlitPct: Math.round(m.sunPct), earthVisiblePct: Math.round(m.earthPct), bothPct: Math.round(m.bothPct), longestNightHours: Math.round(m.longestDarkHours) },
    relay: relayId === 'none' ? 'none' : RELAYS[relayId].name, anyLinkPct14d: Math.round(comms.anyPct),
    terrain: horizon.info ? `${horizon.info.mode || 'precomputed'} LOLA, ${horizon.info.resolutionM} m/px, surface ${horizon.info.elevationM} m` : 'flat (none)',
    solarPanel: { ...powerCfg, nowW: Math.round(power[safeIndex]) },
    mode: learn ? 'Learn (beginner, use simple words)' : 'Expert',
  }

  const TABS = [
    ['3d', '3D'], ['comms', 'Comms'], ['power', 'Power'], ['dates', 'Dates'], ['light', 'Light'], ['compare', `Saved${scenarios.length ? ` ${scenarios.length}` : ''}`], ['about', 'About'],
  ]

  return (
    <LearnContext.Provider value={learn}>
      <div className={`app ${learn ? 'learn' : ''}`}>
        <header className="top">
          <div className="brand">
            <span className="logo">LUNAR NAVIGATOR</span>
            <span className="tag">{w('landing site · sun · earth', 'where and when to land on the Moon')}</span>
          </div>
          <div className="top-right">
            <div className="seg" role="group" aria-label="Explanation level">
              <button className={!learn ? 'on' : ''} onClick={() => setLearn(false)}>Expert</button>
              <button className={learn ? 'on' : ''} onClick={() => setLearn(true)}>Learn</button>
            </div>
            <button className="ghost" onClick={resetAll} title="Reset all settings">Reset</button>
            <div className="menu-wrap">
              <button className="ghost" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>Menu</button>
              {menu && (
                <div className="menu" role="menu">
                  {menuItem('Take the tour', () => { setLearn(true); setTour(true) })}
                  {menuItem('Copy share link', shareLink)}
                  {menuItem('Export data (CSV)', () => exportSeriesCSV({ label, lat: coords.lat, lon: coords.lon, series, clr, horizon, power, relay, relayClr }))}
                  {menuItem('Print / save PDF', printReport)}
                  <a role="menuitem" href={REPO_URL} target="_blank" rel="noreferrer" onClick={() => setMenu(false)}>Download the app (GitHub)</a>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="print-only report-head">
          <h2>{label} · {coords.lat.toFixed(4)}°, {coords.lon.toFixed(4)}°E</h2>
          <p>Landing {fmtUTC(landing.getTime())} · shown at {fmtUTC(now)} · status: {verdict(m).text}</p>
        </div>

        <main className="dash">
          <aside className="col col-left">
            <SitePicker
              siteId={siteId} lat={coords.lat} lon={coords.lon}
              onSite={chooseSite} onCoords={setCustomCoords}
              landing={landing} onLanding={chooseLanding}
              mask={mask} onMask={setMask} terrain={horizon.info}
            />
            <TerrainPanel siteId={siteId} lat={coords.lat} lon={coords.lon} info={horizon.info} state={terrainState}
              localPrecise={localPrecise} onQuick={() => runQuickTerrain(coords.lat, coords.lon)} onPrecise={() => runPreciseTerrain(coords.lat, coords.lon)} />
            <MoonMap lat={coords.lat} lon={coords.lon} siteId={siteId} onPick={setCustomCoords} onSite={chooseSite} />
          </aside>

          <section className="col col-mid">
            <div className="site-line">
              <span className="site-name">{label}</span>
              <span className="mono muted">{coords.lat.toFixed(4)}°, {coords.lon.toFixed(4)}°E{horizon.info ? ` · ${horizon.info.elevationM.toLocaleString('en-US')} m` : ''}</span>
              {site && <span className="muted small">{site.note}</span>}
              <button className={`cmp-add ${inCompare ? 'on' : ''}`} onClick={toggleCompare}
                disabled={!inCompare && compareList.length >= MAX_COMPARE}
                title={!inCompare && compareList.length >= MAX_COMPARE ? 'Two places already selected: remove one in the bar below' : ''}>
                {inCompare ? '✓ In compare' : '⚖ Add to compare'}
              </button>
            </div>

            <MetricCards m={m} source={series.sources.includes('horizons') ? 'horizons' : 'engine'} />

            <div className="panel" id="sky-panel">
              <div className="panel-head">
                <h2>{w('Sky at the site', 'Look around')}</h2>
                <span className="mono muted small">{fmtUTC(now)}</span>
                <div className="legend">
                  <span><i className="dot-ico sun" /> Sun</span>
                  <span><i className="dot-ico earth" /> Earth</span>
                  {relay && <span><i className="dot-ico relay" /> {RELAYS[relayId].short}</span>}
                </div>
                <Hint title="How to read this picture" links={[{ id: 'status-cards', label: 'Status' }, { id: 'scene-panel', label: '3D view' }]}>
                  <p>Imagine standing at the landing site and turning around once. Left to right is the direction (N, E, S, W), up is how high in the sky, in degrees. The grey shape at the bottom is the real outline of the mountains around you, measured by NASA's LOLA laser.</p>
                  <p>The yellow disk is the Sun, the blue one is Earth, and the thin lines show where they will move over the next {DAYS} days. On the Moon there is no air, so there is no twilight: if the Sun is above the mountains you get full sunlight, and the moment it dips behind them it is completely dark.</p>
                </Hint>
              </div>
              <Panorama series={series} index={safeIndex} horizon={horizon} relay={relay} />
            </div>

            <div className="panel" id="timeline-panel">
              <div className="panel-head">
                <h2>{w('Timeline', 'The next month')}</h2>
                <div className="transport">
                  <button className="primary" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
                  <button onClick={() => setIndex((i) => Math.max(0, i - 2 * (60 / STEP_MIN) * 6))}>−12 h</button>
                  <button onClick={() => setIndex((i) => Math.min(series.t.length - 1, i + 2 * (60 / STEP_MIN) * 6))}>+12 h</button>
                  <button onClick={() => setIndex(0)}>Landing</button>
                  <span className="mono muted small">T+{((now - landing.getTime()) / HOUR / 24).toFixed(1)} d</span>
                </div>
                <Hint title="Why does it change so slowly?" links={[{ id: 'planner-panel', label: 'Date planner' }, { id: 'power-panel', label: 'Power' }]}>
                  <p>The Moon spins very slowly: one full day and night takes 29.5 Earth days, so the Sun crawls across the sky and a "night" lasts about two weeks near the equator.</p>
                  <p>Solid lines are how high the Sun (yellow) and Earth (blue) are. Dashed lines are the mountain height in their direction: when a solid line drops below its dashed line, that body is hidden. The coloured bars at the bottom show when each one is visible. Drag across the chart to travel in time, or press Play.</p>
                </Hint>
              </div>
              <Timeline series={series} index={safeIndex} horizon={horizon} clr={clr} relayClr={relayClr} onScrub={(k) => { setPlaying(false); setIndex(k) }} start={landing} />
            </div>
          </section>

          <section className="col col-right">
            <div className="tabs" role="tablist">
              {TABS.map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            <div className="tab-body">
              {tab === '3d' && <Scene3D lat={coords.lat} lon={coords.lon} sun={{ az: m.sunAz, el: m.sunEl }} earth={{ az: m.earthAz, el: m.earthEl }} />}
              {tab === 'comms' && <RelayPanel relayId={relayId} onRelay={setRelayId} relay={relay} clr={clr} relayClr={relayClr} comms={comms} series={series} index={safeIndex} />}
              {tab === 'power' && <PowerPanel series={series} clr={clr} index={safeIndex} cfg={powerCfg} onCfg={setPowerCfg} />}
              {tab === 'dates' && <DatePlanner siteId={siteId} lat={coords.lat} lon={coords.lon} landing={landing} onPick={chooseLanding} horizon={horizon} />}
              {tab === 'light' && <IllumMap lat={coords.lat} lon={coords.lon} start={landing} onPick={setCustomCoords} />}
              {tab === 'compare' && (
                <Compare scenarios={scenarios} onAdd={pin} onLoad={loadScenario}
                  onRemove={(key) => setScenarios((l) => l.filter((s) => s.key !== key))} />
              )}
              {tab === 'about' && (
                <>
                  <MoonVsEarth lat={coords.lat} m={m} />
                  <footer className="foot panel">
                    <p>
                      Ephemerides: <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">JPL Horizons</a> (DE441, airless apparent, pre-downloaded for curated sites)
                      and an in-browser model (astronomy-engine + IAU lunar rotation model with libration), which agrees with Horizons to within 0.004° (RMS 0.001°).
                      Terrain: horizon profiles ray-traced to 300 km through <a href="https://pds-geosciences.wustl.edu/missions/lro/lola.htm" target="_blank" rel="noreferrer">LOLA</a> DEMs, observer 2 m above ground.
                      Shackleton rim, Malapert and Nobile are the best-lit LOLA points near those features; NASA does not publish center points for Artemis III regions.
                      Relay orbits are simplified models.
                    </p>
                    <p>NASA Space Apps Challenge 2026 · Lunar Landing Site Navigator · <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a></p>
                  </footer>
                </>
              )}
            </div>
          </section>
        </main>
        <Tour open={tour} onClose={() => setTour(false)} />
        <CompareTray items={compareList} onRemove={(k) => setCompareList((l) => l.filter((x) => x.key !== k))}
          onClear={() => setCompareList([])} onOpen={() => setCompareOpen(true)} />
        {compareOpen && compareList.length === MAX_COMPARE && (
          <CompareModal items={compareList} landing={landing} powerCfg={powerCfg} relayId={relayId}
            onClose={() => setCompareOpen(false)}
            onOpenSite={(e) => {
              setCompareOpen(false)
              if (e.siteId !== 'custom') chooseSite(e.siteId)
              else { if (e.terrain) setCustomTerrain(e.terrain); setCustomCoords(e.lat, e.lon) }
            }} />
        )}
        <Assistant context={assistantContext} />
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </LearnContext.Provider>
  )
}
