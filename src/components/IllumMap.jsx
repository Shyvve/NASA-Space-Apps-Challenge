import { useEffect, useRef, useState } from 'react'
import { sunEarthAt } from '../lib/ephemeris.js'
import { Explain } from '../lib/learn.jsx'

const N = 9
const DAY = 86400000

/** How much light / Earth visibility the surroundings get over a year: "move 500 m and gain 20 %". */
export function IllumMap({ lat, lon, start, onPick }) {
  const [state, setState] = useState({ status: 'idle' })
  const [metric, setMetric] = useState('sun')
  const workerRef = useRef(null)
  const polar = Math.abs(lat) > 80
  const spacing = polar ? 300 : 3000
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`

  useEffect(() => () => workerRef.current?.terminate(), [])
  // Results belong to one point: clear them when the site moves.
  useEffect(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    setState({ status: 'idle' })
  }, [key])

  const run = () => {
    workerRef.current?.terminate()
    const w = new Worker(new URL('../lib/illumWorker.js', import.meta.url), { type: 'module' })
    workerRef.current = w
    const sun = [], earth = []
    const t0 = new Date(start).setUTCHours(0, 0, 0, 0)
    for (let k = 0; k < 365 * 2; k++) {
      const p = sunEarthAt(new Date(t0 + k * DAY * 0.5), lat, lon)
      sun.push([p.sun.az, p.sun.el])
      earth.push([p.earth.az, p.earth.el])
    }
    setState({ status: 'running', done: 0, total: N * N })
    w.onmessage = (e) => {
      const d = e.data
      if (d.type === 'progress') setState({ status: 'running', done: d.done, total: d.total })
      if (d.type === 'error') setState({ status: 'error', error: d.error })
      if (d.type === 'done') setState({ status: 'done', cells: d.cells, key })
    }
    w.postMessage({ base: new URL(import.meta.env.BASE_URL, location.href).href, lat, lon, spacingM: spacing, n: N, sun, earth })
  }

  const cells = state.status === 'done' ? state.cells : null
  const center = cells?.find((c) => c.i === (N - 1) / 2 && c.j === (N - 1) / 2)
  const best = cells?.reduce((a, b) => (b[metric] > a[metric] ? b : a))
  const label = { sun: 'Sunlight', earth: 'Earth in view', both: 'Sun + Earth' }[metric]
  const dir = (c) => {
    const h = (N - 1) / 2
    const dn = (h - c.i) * spacing, de = (c.j - h) * spacing
    const d = Math.hypot(dn, de)
    if (!d) return 'right here'
    const ns = dn > 0 ? 'north' : dn < 0 ? 'south' : '', ew = de > 0 ? 'east' : de < 0 ? 'west' : ''
    return `${d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`} ${[ns, ew].filter(Boolean).join('-')}`
  }

  return (
    <div className="panel" id="illum-panel">
      <div className="panel-head">
        <h2>Light around the site</h2>
        <p>
          A {N}×{N} grid, {spacing >= 1000 ? `${spacing / 1000} km` : `${spacing} m`} apart, centred on the site: share of the next 12 months
          each spot sees the {metric === 'earth' ? 'Earth' : 'Sun'}. Each cell gets its own LOLA horizon (quick mode). Most dramatic near the poles.
        </p>
        <div className="seg">
          {['sun', 'earth', 'both'].map((k) => (
            <button key={k} className={metric === k ? 'on' : ''} onClick={() => setMetric(k)}>{{ sun: 'Sun', earth: 'Earth', both: 'Both' }[k]}</button>
          ))}
        </div>
      </div>
      {state.status === 'idle' && <button className="primary" onClick={run}>Scan the surroundings</button>}
      {state.status === 'running' && (
        <div className="progress"><div style={{ width: `${(100 * state.done) / state.total}%` }} /><span>Computing {state.done}/{state.total} horizons…</span></div>
      )}
      {state.status === 'error' && <p className="warn">Scan failed: {state.error} <button onClick={run}>Retry</button></p>}
      {cells && (
        <div className="illum">
          <div className="illum-grid" style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}>
            {cells.map((c) => (
              <button key={`${c.i}-${c.j}`}
                className={`illum-cell ${c === center ? 'center' : ''} ${c === best ? 'best' : ''}`}
                style={{ background: `color-mix(in oklab, var(--${metric}) ${Math.round(c[metric])}%, var(--cell-empty))` }}
                title={`${dir(c)} · ${label} ${c[metric].toFixed(0)}% · ${c.lat.toFixed(4)}°, ${c.lon.toFixed(4)}°E · ${c.h} m`}
                onClick={() => onPick(Math.round(c.lat * 1e5) / 1e5, Math.round(c.lon * 1e5) / 1e5)}>
                {Math.round(c[metric])}
              </button>
            ))}
          </div>
          <div className="illum-side">
            <div className="big mono">{Math.round(center[metric])}%</div>
            <p className="muted small">{label} at the site</p>
            {best !== center && best[metric] - center[metric] >= 1 ? (
              <>
                <div className="big mono gain">+{Math.round(best[metric] - center[metric])}%</div>
                <p className="muted small">by moving {dir(best)} ({Math.round(best[metric])}%)</p>
                <button className="primary" onClick={() => onPick(Math.round(best.lat * 1e5) / 1e5, Math.round(best.lon * 1e5) / 1e5)}>Move there</button>
              </>
            ) : (
              <p className="muted small">This is already the best spot in the grid.</p>
            )}
            <p className="muted small">N is up. Ring = site, star = best cell. Click a cell to move there.</p>
          </div>
        </div>
      )}
      <Explain title="Why does moving a few hundred metres help?" links={[{ id: 'sky-panel', label: 'Sky view' }, { id: 'map-panel', label: 'Map' }]}>
        <p>Near the pole the Sun is only 1–2° above the horizon, lower than a hill seen from a few kilometres away. Standing on top of a ridge is like climbing a tower: you see over the nearby hills, so the Sun stays visible much longer. In a dip, nearby slopes block it.</p>
      </Explain>
    </div>
  )
}
