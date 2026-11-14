import { useRef } from 'react'
import { EARTH_RADIUS_DEG, SUN_RADIUS_DEG } from '../lib/scenario.js'

const DAY = 86400000

function elRange(series, index) {
  let hi = -90, lo = 90
  for (let k = 0; k < series.sunEl.length; k++) {
    hi = Math.max(hi, series.sunEl[k], series.earthEl[k])
    lo = Math.min(lo, series.sunEl[k], series.earthEl[k])
  }
  const yMax = Math.min(90, Math.max(6, Math.ceil(hi + 2)))
  // Polar sites: show the whole near-horizon band (bodies dip a few degrees below). Elsewhere: just a strip of ground.
  const yMin = yMax <= 12 ? Math.max(-10, Math.min(-4, Math.floor(lo - 1.5))) : -10
  return { yMin, yMax }
}

function ticks(lo, hi) {
  const span = hi - lo
  const step = span <= 12 ? 1 : span <= 30 ? 5 : span <= 60 ? 10 : 15
  const out = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v)
  return out
}

// Polyline segments, broken where the azimuth wraps around 0/360.
function trackPaths(az, el, x, y, every = 1) {
  const paths = []
  let cur = ''
  let prev = null
  for (let k = 0; k < az.length; k += every) {
    if (prev != null && Math.abs(az[k] - prev) > 180) {
      paths.push(cur)
      cur = ''
    }
    cur += `${cur ? 'L' : 'M'}${x(az[k]).toFixed(1)},${y(el[k]).toFixed(1)}`
    prev = az[k]
  }
  if (cur) paths.push(cur)
  return paths
}

/** 360° horizon panorama: azimuth on X, elevation on Y, with the Sun and Earth tracks for the whole window. */
export function Panorama({ series, index, mask }) {
  const W = 960, H = 280, L = 40, R = 12, T = 14, B = 30
  const { yMin, yMax } = elRange(series, index)
  const x = (az) => L + (az / 360) * (W - L - R)
  const y = (el) => T + ((yMax - el) / (yMax - yMin)) * (H - T - B)
  const pxPerDeg = (H - T - B) / (yMax - yMin)
  const sunR = Math.max(6, SUN_RADIUS_DEG * pxPerDeg)
  const earthR = Math.max(7, EARTH_RADIUS_DEG * pxPerDeg)
  const cur = {
    sun: [series.sunAz[index], series.sunEl[index]],
    earth: [series.earthAz[index], series.earthEl[index]],
  }
  const every = Math.max(1, Math.floor(series.sunAz.length / 600))
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label="Sun and Earth positions around the horizon over the planning window">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sky-top)" />
          <stop offset="1" stopColor="var(--sky-bottom)" />
        </linearGradient>
        <radialGradient id="sunGlow">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset="0.6" stopColor="#ffd34d" />
          <stop offset="1" stopColor="#ffb000" stopOpacity="0" />
        </radialGradient>
        <clipPath id="plotClip">
          <rect x={L} y={T} width={W - L - R} height={H - T - B} />
        </clipPath>
      </defs>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="url(#sky)" rx="4" />
      {ticks(yMin, yMax).map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'grid zero' : 'grid'} />
          <text x={L - 6} y={y(v) + 4} className="axis" textAnchor="end">{v}°</text>
        </g>
      ))}
      {[0, 45, 90, 135, 180, 225, 270, 315, 360].map((a) => (
        <g key={a}>
          <line x1={x(a)} x2={x(a)} y1={T} y2={H - B} className="grid" />
          <text x={x(a)} y={H - B + 16} className="axis" textAnchor="middle">
            {{ 0: 'N', 90: 'E', 180: 'S', 270: 'W', 360: 'N' }[a] ?? `${a}°`}
          </text>
        </g>
      ))}
      <g clipPath="url(#plotClip)">
        {trackPaths(series.sunAz, series.sunEl, x, y, every).map((d, i) => (
          <path key={`s${i}`} d={d} className="track sun" />
        ))}
        {trackPaths(series.earthAz, series.earthEl, x, y, every).map((d, i) => (
          <path key={`e${i}`} d={d} className="track earth" />
        ))}
        <circle cx={x(cur.sun[0])} cy={y(cur.sun[1])} r={sunR * 2.2} fill="url(#sunGlow)" opacity="0.6" />
        <circle cx={x(cur.sun[0])} cy={y(cur.sun[1])} r={sunR} className="body sun" />
        <circle cx={x(cur.earth[0])} cy={y(cur.earth[1])} r={earthR} className="body earth" />
        {/* terrain mask (uniform for now): drawn over the bodies, so anything below the horizon is hidden */}
        <rect x={L} y={y(mask)} width={W - L - R} height={H - B - y(mask)} className="ground" />
      </g>
      <line x1={L} x2={W - R} y1={y(mask)} y2={y(mask)} className="horizon-line" />
      <text x={W - R - 6} y={y(mask) + 14} className="axis ground-label" textAnchor="end">
        {mask === 0 ? 'Geometric horizon (no atmosphere, no refraction)' : `Terrain horizon ${mask}°`}
      </text>
    </svg>
  )
}

/** Elevation vs time for the window, with visibility bands and a draggable time cursor. */
export function Timeline({ series, index, mask, onScrub, start }) {
  const ref = useRef(null)
  const W = 960, H = 250, L = 40, R = 12, T = 12, B = 64
  const n = series.t.length
  const { yMin, yMax } = elRange(series, index)
  const x = (k) => L + (k / (n - 1)) * (W - L - R)
  const y = (el) => T + ((yMax - el) / (yMax - yMin)) * (H - T - B)
  const line = (arr) => {
    let d = ''
    const every = Math.max(1, Math.floor(n / 900))
    for (let k = 0; k < n; k += every) d += `${d ? 'L' : 'M'}${x(k).toFixed(1)},${y(arr[k]).toFixed(1)}`
    return d
  }
  const bands = (arr, radius) => {
    const out = []
    let s = null
    for (let k = 0; k < n; k++) {
      const up = arr[k] + radius > mask
      if (up && s == null) s = k
      if ((!up || k === n - 1) && s != null) {
        out.push([s, up ? k : k - 1])
        s = null
      }
    }
    return out
  }
  const scrub = (e) => {
    const box = ref.current.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    const k = Math.round(((px - L) / (W - L - R)) * (n - 1))
    onScrub(Math.max(0, Math.min(n - 1, k)))
  }
  const bandY1 = H - B + 22, bandY2 = H - B + 40
  const days = series.days
  return (
    <svg ref={ref} className="chart scrub" viewBox={`0 0 ${W} ${H}`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e) }}
      onPointerMove={(e) => e.buttons && scrub(e)}
      role="img" aria-label="Sun and Earth elevation over time">
      {ticks(yMin, yMax).map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'grid zero' : 'grid'} />
          <text x={L - 6} y={y(v) + 4} className="axis" textAnchor="end">{v}°</text>
        </g>
      ))}
      {Array.from({ length: days + 1 }, (_, d) => d).filter((d) => d % (days > 20 ? 5 : 2) === 0).map((d) => {
        const k = Math.round((d * 24 * 60) / series.stepMin)
        const date = new Date(start.getTime() + d * DAY)
        return (
          <g key={d}>
            <line x1={x(k)} x2={x(k)} y1={T} y2={H - B} className="grid" />
            <text x={x(k)} y={H - 4} className="axis" textAnchor="middle">
              {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
            </text>
          </g>
        )
      })}
      <rect x={L} y={y(mask)} width={W - L - R} height={H - B - y(mask)} className="ground faint" />
      <path d={line(series.earthEl.map((v) => Math.max(yMin, v)))} className="line earth" />
      <path d={line(series.sunEl.map((v) => Math.max(yMin, v)))} className="line sun" />
      {bands(series.sunEl, SUN_RADIUS_DEG).map(([a, b]) => (
        <rect key={`sb${a}`} x={x(a)} width={Math.max(1, x(b) - x(a))} y={bandY1} height={7} className="band sun" />
      ))}
      {bands(series.earthEl, EARTH_RADIUS_DEG).map(([a, b]) => (
        <rect key={`eb${a}`} x={x(a)} width={Math.max(1, x(b) - x(a))} y={bandY1 + 10} height={7} className="band earth" />
      ))}
      <text x={L - 6} y={bandY1 + 7} className="axis" textAnchor="end">Sun</text>
      <text x={L - 6} y={bandY1 + 17} className="axis" textAnchor="end">Earth</text>
      <line x1={x(index)} x2={x(index)} y1={T} y2={bandY2} className="cursor" />
      <circle cx={x(index)} cy={y(Math.max(yMin, series.sunEl[index]))} r="4" className="dot sun" />
      <circle cx={x(index)} cy={y(Math.max(yMin, series.earthEl[index]))} r="4" className="dot earth" />
    </svg>
  )
}
