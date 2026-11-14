import { useRef, useState } from 'react'
import { SITES } from '../data/sites.js'
import { Explain } from '../lib/learn.jsx'

const R = 1737.4 // km
const POLE_EXTENT_KM = 320 // must match scripts/build-maps.mjs
const RAD = Math.PI / 180
const BASE = import.meta.env.BASE_URL

// South polar stereographic (Earth-facing 0°E up): lat/lon <-> fraction of the image (0..1).
function poleToXY(lat, lon) {
  const k = 2 * R * Math.tan(Math.PI / 4 + (lat * RAD) / 2)
  const x = k * Math.sin(lon * RAD), y = k * Math.cos(lon * RAD)
  return [0.5 + x / (2 * POLE_EXTENT_KM), 0.5 - y / (2 * POLE_EXTENT_KM)]
}
function poleFromXY(fx, fy) {
  const x = (fx - 0.5) * 2 * POLE_EXTENT_KM, y = (0.5 - fy) * 2 * POLE_EXTENT_KM
  const k = Math.hypot(x, y)
  return [(2 * (Math.atan(k / (2 * R)) - Math.PI / 4)) / RAD, Math.atan2(x, y) / RAD]
}
const globeToXY = (lat, lon) => [(((lon + 540) % 360) - 180 + 180) / 360, (90 - lat) / 180]
const globeFromXY = (fx, fy) => [90 - fy * 180, fx * 360 - 180]

const VIEWS = {
  pole: { img: 'maps/south-pole.png', ratio: 1, to: poleToXY, from: poleFromXY, label: 'South pole', note: `±${POLE_EXTENT_KM} km around the pole · Earth-facing side up` },
  globe: { img: 'maps/moon.png', ratio: 2, to: globeToXY, from: globeFromXY, label: 'Whole Moon', note: 'Near side in the middle (0°E), far side at the edges' },
}
const inView = (v, lat, lon) => {
  const [x, y] = VIEWS[v].to(lat, lon)
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 && (v === 'globe' || lat < -70)
}

/** Clickable shaded-relief map (LOLA). Click anywhere to land there. */
export function MoonMap({ lat, lon, siteId, onPick, onSite }) {
  const [view, setView] = useState(() => (lat < -79 ? 'pole' : 'globe'))
  const [hover, setHover] = useState(null)
  const ref = useRef(null)
  const V = VIEWS[view]
  const pos = (e) => {
    const b = ref.current.getBoundingClientRect()
    return V.from((e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height)
  }
  const [cx, cy] = V.to(lat, lon)
  const current = inView(view, lat, lon)
  return (
    <div className="panel" id="map-panel">
      <div className="panel-head">
        <h2>Pick a landing site on the map</h2>
        <p>Click anywhere to land there. Shaded relief from LOLA laser altimetry. {V.note}.</p>
        <div className="seg" role="tablist">
          {Object.entries(VIEWS).map(([k, v]) => (
            <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{v.label}</button>
          ))}
        </div>
      </div>
      <div
        ref={ref}
        className="moonmap"
        style={{ aspectRatio: `${V.ratio}` }}
        onMouseMove={(e) => setHover(pos(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const [la, lo] = pos(e)
          onPick(Math.round(la * 10000) / 10000, Math.round(lo * 10000) / 10000)
        }}
      >
        <img src={`${BASE}${V.img}`} alt={`Shaded relief map: ${V.label}`} draggable="false" loading="lazy" />
        {view === 'pole' && <span className="map-tag" style={{ left: '50%', top: '50%' }}>South pole</span>}
        {SITES.filter((s) => inView(view, s.lat, s.lon)).map((s) => {
          const [x, y] = V.to(s.lat, s.lon)
          return (
            <button key={s.id} className={`map-site ${s.id === siteId ? 'on' : ''}`} style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
              title={`${s.name} (${s.lat.toFixed(2)}°, ${s.lon.toFixed(2)}°E)`}
              onClick={(e) => { e.stopPropagation(); onSite(s.id) }}>
              <span>{s.name}</span>
            </button>
          )
        })}
        {current && <span className="map-pin" style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }} aria-label="Current landing site" />}
        {hover && (
          <span className="map-coords mono">{hover[0].toFixed(3)}°, {hover[1].toFixed(3)}°E · click to land</span>
        )}
      </div>
      <Explain title="Why the south pole?" links={[{ id: 'sky-panel', label: 'Sky view' }, { id: 'illum-panel', label: 'Light around the site' }]}>
        <p>The craters near the south pole hide water ice in places the Sun never reaches, which future astronauts could use for drinking water, air and rocket fuel. But the Sun there always skims the horizon, so a hill can mean weeks of light and a crater floor means permanent darkness.</p>
        <p>The map is shaded from NASA's LOLA laser measurements: bright slopes face the (pretend) light, darker areas are low.</p>
      </Explain>
    </div>
  )
}
