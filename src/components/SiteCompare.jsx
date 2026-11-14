import { useEffect, useMemo, useState } from 'react'
import { clearances, commsMetrics, formatDuration, metricsAt, relayClearance } from '../lib/scenario.js'
import { relaySeries, RELAYS } from '../lib/relay.js'
import { useHorizon, useSeries } from '../lib/useSeries.js'
import { useWords } from '../lib/learn.jsx'
import { Panorama } from './Charts.jsx'
import { batteryNeed, powerSeries } from './Power.jsx'
import { verdict } from './Panels.jsx'

const DAYS = 14
const STEP = 30
export const MAX_COMPARE = 2

/** Everything we compare for one place, at the shared landing date, over the first 14 days. */
function useEvaluate(e, landing, powerCfg, relayId) {
  const series = useSeries(e.siteId, e.lat, e.lon, landing, DAYS, STEP)
  const horizon = useHorizon(e.siteId, 0, e.terrain)
  return useMemo(() => {
    const clr = clearances(series, horizon)
    const m = metricsAt(series, 0, horizon, DAYS, clr)
    const relay = relaySeries(relayId, e.lat, e.lon, series.t)
    const comms = commsMetrics(clr, relayClearance(relay, horizon), 0, STEP, DAYS)
    const p = powerSeries(series, clr, powerCfg)
    let sum = 0
    for (const w of p) sum += w
    const avgW = sum / p.length
    const batteryKWh = avgW < powerCfg.load ? Infinity : batteryNeed(p, powerCfg.load, STEP / 60) / 1000
    return { e, series, horizon, m, comms, avgW, batteryKWh }
  }, [series, horizon, powerCfg, relayId, e])
}

/** Bottom bar listing the places picked for comparison (like a shop's compare tray). */
export function CompareTray({ items, onRemove, onClear, onOpen }) {
  if (!items.length) return null
  return (
    <div className="cmp-tray" role="region" aria-label="Places to compare">
      <span className="cmp-tray-title">Compare {items.length}/{MAX_COMPARE}</span>
      {items.map((it, i) => (
        <span key={it.key} className="cmp-chip">
          <b>{'AB'[i]}</b> {it.label}
          <button aria-label={`Remove ${it.label}`} onClick={() => onRemove(it.key)}>×</button>
        </span>
      ))}
      {items.length < MAX_COMPARE && <span className="muted small">Pick another place (map, list or coordinates) and press “Add to compare”</span>}
      <span className="cmp-tray-sp" />
      <button className="ghost" onClick={onClear}>Clear</button>
      <button className="primary" disabled={items.length < MAX_COMPARE} onClick={onOpen}>Compare</button>
    </div>
  )
}

/** Full-screen "2 in 1" comparison: two columns, spec rows grouped by section, better value highlighted. */
export function CompareModal({ items, landing, powerCfg, relayId, onClose, onOpenSite }) {
  const w = useWords()
  const A = useEvaluate(items[0], landing, powerCfg, relayId)
  const B = useEvaluate(items[1], landing, powerCfg, relayId)
  const [diffOnly, setDiffOnly] = useState(false)
  const relayOn = relayId !== 'none'

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pct = (v) => `${Math.round(v)}%`
  // [label, value getter, formatter, better: 'hi' | 'lo' | null, reason used in the verdict]
  const sections = [
    [w('Location', 'Where'), [
      ['Coordinates', (x) => `${x.e.lat.toFixed(3)}°, ${x.e.lon.toFixed(3)}°E`, (v) => v, null],
      [w('Surface height', 'Height of the ground'), (x) => x.horizon.info?.elevationM, (v) => (v == null ? '—' : `${v.toLocaleString('en-US')} m`), null],
      [w('Terrain data', 'Map detail'), (x) => x.horizon.info?.resolutionM, (v) => (v == null ? 'flat (none)' : `LOLA ${v} m/px`), null],
      [w('Highest terrain around', 'Highest mountains around'), (x) => (x.horizon.terrain ? Math.max(...x.horizon.terrain) : 0), (v) => `${v.toFixed(1)}°`, 'lo', 'a more open horizon'],
    ]],
    [w('At landing', 'When you land'), [
      [w('Status', 'Situation'), (x) => verdict(x.m, w).text, (v) => v, null],
      // Raw angles ignore the mountains, so they are shown but not scored; visibility rows below are what matters.
      [w('Sun elevation', 'How high the Sun is'), (x) => x.m.sunEl, (v) => `${v.toFixed(2)}°`, null],
      [w('Sun visible', 'Sun above the mountains'), (x) => (x.m.sunUp ? 1 : 0), (v) => (v ? 'yes' : 'no'), 'hi', 'sunlight right at landing'],
      [w('Earth elevation', 'How high the Earth is'), (x) => x.m.earthEl, (v) => `${v.toFixed(2)}°`, null],
      [w('Earth visible', 'Earth above the mountains'), (x) => (x.m.earthUp ? 1 : 0), (v) => (v ? 'yes' : 'no'), 'hi', 'contact right at landing'],
    ]],
    [w(`First ${DAYS} days`, `The first ${DAYS} days`), [
      [w('Sunlight', 'Sunny time'), (x) => x.m.sunPct, pct, 'hi', 'more sunlight'],
      [w('Earth in view', 'Can talk to Earth'), (x) => x.m.earthPct, pct, 'hi', 'more direct contact with Earth'],
      [w('Sun + Earth together', 'Sun and contact together'), (x) => x.m.bothPct, pct, 'hi', 'more time with both power and contact'],
      [w('Longest night', 'Longest darkness'), (x) => x.m.longestDarkHours, (v) => formatDuration(v) || '0 h', 'lo', 'a shorter night'],
      [w('Highest Sun', 'Highest Sun in the sky'), (x) => x.m.maxSunEl, (v) => `${v.toFixed(1)}°`, null],
    ]],
    [w('Power', 'Electricity'), [
      [w('Average solar power', 'Average electricity'), (x) => x.avgW, (v) => `${Math.round(v)} W`, 'hi', 'more electricity'],
      [w('Energy per Earth day', 'Energy per day'), (x) => x.avgW * 24 / 1000, (v) => `${v.toFixed(2)} kWh`, 'hi', null],
      [w('Battery needed', 'Battery for the night'), (x) => x.batteryKWh, (v) => (Number.isFinite(v) ? `${v.toFixed(1)} kWh` : 'not enough sun'), 'lo', 'a smaller battery'],
    ]],
    [w('Communications', 'Contact with Earth'), [
      ...(relayOn ? [[w(`Any link (+${RELAYS[relayId].short})`, 'Contact incl. satellite'), (x) => x.comms.anyPct, pct, 'hi', 'more contact time with the relay']] : []),
      [w('Longest silence', 'Longest time without contact'), (x) => x.comms.longestGapHours, (v) => formatDuration(v) || '0 h', 'lo', 'shorter radio silences'],
    ]],
  ]

  let winsA = [], winsB = []
  const rendered = sections.map(([title, rows]) => {
    const out = rows.map(([label, get, fmt, better, why]) => {
      const a = get(A), b = get(B)
      const fa = fmt(a), fb = fmt(b)
      let win = null
      if (better && typeof a === 'number' && typeof b === 'number' && fa !== fb) {
        win = (better === 'hi' ? a > b : a < b) ? 'A' : 'B'
        if (why) (win === 'A' ? winsA : winsB).push(why)
      }
      return { label, fa, fb, win, same: fa === fb }
    })
    return { title, rows: out }
  })
  const score = (x) => x.m.bothPct * 2 + x.m.sunPct + (relayOn ? x.comms.anyPct : x.m.earthPct) - Math.min(x.m.longestDarkHours, 336) / 3.36
  const tie = Math.abs(score(A) - score(B)) < 1
  const best = tie ? null : score(A) > score(B) ? 'A' : 'B'
  const nameOf = (t) => (t === 'A' ? A.e.label : B.e.label)

  const Head = ({ x, tag }) => (
    <div className={`cmpm-head ${best === tag ? 'winner' : ''}`}>
      <div className="cmpm-tagline"><span className="cmp-tag">{tag}</span>{best === tag && <span className="cmpm-best">{w('Better choice', 'Better place')}</span>}</div>
      <div className="cmp-name">{x.e.label}</div>
      {x.e.note && <div className="muted small">{x.e.note}</div>}
      <div className="cmp-pano"><Panorama series={x.series} index={0} horizon={x.horizon} /></div>
      <button onClick={() => onOpenSite(x.e)}>Open this site</button>
    </div>
  )

  return (
    <div className="cmpm-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmpm" role="dialog" aria-modal="true" aria-label="Compare two places">
        <div className="cmpm-bar">
          <h2>{w('Compare places', 'Which place is better?')}</h2>
          <span className="mono muted small">landing {landing.toISOString().slice(0, 16).replace('T', ' ')} UTC · first {DAYS} days{relayOn ? ` · relay ${RELAYS[relayId].short}` : ''}</span>
          <label className="cmpm-diff"><input type="checkbox" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} /> {w('Only differences', 'Show only differences')}</label>
          <button className="icon" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="cmpm-verdict">
          {tie ? (
            <>{w('Both places are about equally good for this date.', 'Both places are about the same for this date.')}</>
          ) : (
            <>
              <b>{nameOf(best)}</b> {w('is the better landing site for this date', 'is the better place to land on this date')}
              {(best === 'A' ? winsA : winsB).length > 0 && <>: {(best === 'A' ? winsA : winsB).slice(0, 4).join(', ')}</>}.
              {(best === 'A' ? winsB : winsA).length > 0 && <> {nameOf(best === 'A' ? 'B' : 'A')} {w('wins on', 'is better for')} {(best === 'A' ? winsB : winsA).join(', ')}.</>}
            </>
          )}
        </div>

        <div className="cmpm-scroll">
          <div className="cmpm-grid cmpm-heads">
            <div />
            <Head x={A} tag="A" />
            <Head x={B} tag="B" />
          </div>
          {rendered.map((sec) => {
            const rows = diffOnly ? sec.rows.filter((r) => !r.same) : sec.rows
            if (!rows.length) return null
            return (
              <div key={sec.title} className="cmpm-sec">
                <div className="cmpm-sec-title">{sec.title}</div>
                {rows.map((r) => (
                  <div key={r.label} className="cmpm-grid cmpm-row">
                    <div className="cmpm-label">{r.label}</div>
                    <div className={`cmpm-val ${r.win === 'A' ? 'win' : r.win === 'B' ? 'lose' : ''}`}>{r.fa}{r.win === 'A' && <span className="tick">✓</span>}</div>
                    <div className={`cmpm-val ${r.win === 'B' ? 'win' : r.win === 'A' ? 'lose' : ''}`}>{r.fb}{r.win === 'B' && <span className="tick">✓</span>}</div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
