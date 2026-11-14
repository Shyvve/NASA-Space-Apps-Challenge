import { RELAYS } from '../lib/relay.js'
import { formatDuration } from '../lib/scenario.js'
import { Explain, Info, useWords } from '../lib/learn.jsx'

const DAY = 86400000

/** Direct-to-Earth vs relay communication windows. */
export function RelayPanel({ relayId, onRelay, relay, clr, relayClr, comms, series, index }) {
  const w = useWords()
  const def = RELAYS[relayId]
  const n = series.t.length
  const W = 960, L = 130, R = 10, rowH = 12, gap = 6
  const x = (k) => L + (k / (n - 1)) * (W - L - R)
  const bands = (pred) => {
    const out = []
    let s = null
    for (let k = 0; k < n; k++) {
      const up = pred(k)
      if (up && s == null) s = k
      if ((!up || k === n - 1) && s != null) { out.push([s, up ? k : k - 1]); s = null }
    }
    return out
  }
  const rows = [
    { label: w('Direct to Earth', 'Talk directly'), cls: 'earth', pred: (k) => clr.earth[k] > 0 },
    ...(relayClr ? [
      { label: w('Via relay', 'Via satellite'), cls: 'relay', pred: (k) => relayClr[k] > 0 },
      { label: w('Any link', 'Can talk at all'), cls: 'both', pred: (k) => clr.earth[k] > 0 || relayClr[k] > 0 },
    ] : []),
  ]
  const H = rows.length * (rowH + gap) + 22
  return (
    <div className="panel" id="relay-panel">
      <div className="panel-head">
        <h2>{w('Communications: direct or via relay', 'Calling home: directly or through a satellite')}</h2>
        <Info>
          {w('Without Earth above the local horizon there is no direct link. A relay satellite that sees both the site and Earth can forward the signal.',
            'If mountains or the Moon itself hide Earth, the lander can send its message to a satellite instead, and the satellite passes it on to Earth.')}
          {def?.about && <> {def.about} Orbits are simplified models with an arbitrary phase.</>}
        </Info>
      </div>
      <div className="relay-pick">
        {Object.entries(RELAYS).map(([id, r]) => (
          <button key={id} className={`relay-opt ${relayId === id ? 'on' : ''}`} onClick={() => onRelay(id)}>
            <b>{r.short}</b>
            <span>{r.name}</span>
          </button>
        ))}
      </div>
      <div className="relay-stats">
        <div><span className="muted small">{w('Direct, next 14 d', 'Direct contact')}</span><b className="mono">{Math.round(comms.directPct)}%</b></div>
        {relayClr && <div><span className="muted small">{w('Relay, next 14 d', 'Through satellite')}</span><b className="mono">{Math.round(comms.relayPct)}%</b></div>}
        <div><span className="muted small">{w('Any link, next 14 d', 'Contact in total')}</span><b className="mono">{Math.round(comms.anyPct)}%</b></div>
        <div><span className="muted small">{w('Longest silence', 'Longest time with no contact')}</span><b className="mono">{formatDuration(comms.longestGapHours) || '0 h'}</b></div>
        <div>
          <span className="muted small">{comms.linkUp ? w('Link lost in', 'Contact lost in') : w('Link back in', 'Contact back in')}</span>
          <b className="mono">{formatDuration(comms.linkFlipHours) ?? '> 30 d'}</b>
        </div>
        {relay && (
          <div>
            <span className="muted small">{w('Relay now', 'Satellite now')}</span>
            <b className="mono">{relay.el[index] >= 0 ? `${relay.el[index].toFixed(1)}° up` : 'below horizon'}{!relay.earth[index] ? ', Earth hidden' : ''}</b>
          </div>
        )}
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Communication windows over time">
        {rows.map((r, j) => (
          <g key={r.label}>
            <text x={L - 8} y={j * (rowH + gap) + rowH - 2} className="axis" textAnchor="end">{r.label}</text>
            <rect x={L} y={j * (rowH + gap)} width={W - L - R} height={rowH} className="band-bg" />
            {bands(r.pred).map(([a, b]) => (
              <rect key={a} x={x(a)} width={Math.max(1, x(b) - x(a))} y={j * (rowH + gap)} height={rowH} className={`band ${r.cls}`} />
            ))}
          </g>
        ))}
        {Array.from({ length: series.days / 5 + 1 }, (_, d) => d * 5).map((d) => {
          const k = Math.round((d * 24 * 60) / series.stepMin)
          return (
            <text key={d} x={x(Math.min(k, n - 1))} y={H - 4} className="axis" textAnchor="middle">
              {new Date(series.t[0] + d * DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
            </text>
          )
        })}
        <line x1={x(index)} x2={x(index)} y1={0} y2={H - 16} className="cursor" />
      </svg>
      <Explain title="Why would you need a relay?" links={[{ id: 'status-cards', label: 'Status' }, { id: 'sky-panel', label: 'Sky view (purple = relay)' }]}>
        <p>Radio needs a straight line. From the far side of the Moon, Earth is <b>never</b> in the sky, and at the south pole mountains often hide it. A relay satellite flies where it can see both the lander and Earth, and passes the messages along, like a mobile phone tower in space.</p>
        <p>China's Chang'e 4 landed on the far side in 2019 and talked to Earth only through the Queqiao satellite. NASA is planning relays for Artemis at the south pole.</p>
      </Explain>
    </div>
  )
}
