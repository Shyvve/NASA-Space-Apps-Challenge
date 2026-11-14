import { sunEarthAt } from './ephemeris.js'

// Mean angular radii seen from the Moon (deg). Visibility uses the upper limb:
// a body counts as "up" while any part of its disk is above the local horizon.
export const SUN_RADIUS_DEG = 0.267
export const EARTH_RADIUS_DEG = 0.95

const HOUR = 3600 * 1000
const horizonsCache = new Map()

export function loadHorizons(siteId) {
  if (!horizonsCache.has(siteId)) {
    const url = `${import.meta.env.BASE_URL}horizons/${siteId}.json`
    horizonsCache.set(
      siteId,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    )
  }
  return horizonsCache.get(siteId)
}

function interpAz(a0, a1, f) {
  let d = a1 - a0
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return (a0 + d * f + 360) % 360
}

/**
 * Returns a sampler(date) -> { sun:{az,el}, earth:{az,el}, source }.
 * Uses JPL Horizons tables when the site is curated and the date is inside the downloaded range,
 * otherwise the in-browser ephemeris.
 */
export function makeSampler(lat, lon, horizons) {
  const engine = (date) => {
    const r = sunEarthAt(date, lat, lon)
    return { sun: { az: r.sun.az, el: r.sun.el }, earth: { az: r.earth.az, el: r.earth.el }, source: 'engine' }
  }
  if (!horizons) return engine
  const t0 = Date.parse(horizons.start)
  const step = horizons.stepHours * HOUR
  const n = horizons.sun.az.length
  const { az: sa, el: se } = horizons.scale
  return (date) => {
    const x = (date.getTime() - t0) / step
    const i = Math.floor(x)
    if (i < 0 || i >= n - 1) return engine(date)
    const f = x - i
    const pick = (b) => ({
      az: interpAz(b.az[i] / sa, b.az[i + 1] / sa, f),
      el: (b.el[i] + (b.el[i + 1] - b.el[i]) * f) / se,
    })
    return { sun: pick(horizons.sun), earth: pick(horizons.earth), source: 'horizons' }
  }
}

export function horizonsCovers(horizons, startDate, days) {
  if (!horizons) return false
  const t0 = Date.parse(horizons.start)
  const t1 = t0 + (horizons.sun.az.length - 1) * horizons.stepHours * HOUR
  return startDate.getTime() >= t0 && startDate.getTime() + days * 24 * HOUR <= t1
}

/** Samples a time series starting at `start` for `days` days with `stepMin` minute resolution. */
export function computeSeries(sampler, start, days = 30, stepMin = 30) {
  const n = Math.round((days * 24 * 60) / stepMin) + 1
  const t = new Array(n), sunAz = new Float32Array(n), sunEl = new Float32Array(n)
  const earthAz = new Float32Array(n), earthEl = new Float32Array(n)
  const sources = new Set()
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime() + i * stepMin * 60000)
    const p = sampler(d)
    t[i] = d.getTime()
    sunAz[i] = p.sun.az
    sunEl[i] = p.sun.el
    earthAz[i] = p.earth.az
    earthEl[i] = p.earth.el
    sources.add(p.source)
  }
  return { t, sunAz, sunEl, earthAz, earthEl, stepMin, days, sources: [...sources] }
}

/**
 * Local horizon model: LOLA terrain profile (horizon elevation per azimuth bin) plus a uniform extra margin.
 * horizon = { terrain: number[] | null, azStep: number, extra: number }
 */
export function horizonAt(horizon, az) {
  if (!horizon) return 0
  let h = horizon.extra || 0
  const t = horizon.terrain
  if (t) {
    const x = (((az % 360) + 360) % 360) / horizon.azStep
    const i = Math.floor(x) % t.length, j = (i + 1) % t.length, f = x - Math.floor(x)
    h += t[i] * (1 - f) + t[j] * f
  }
  return h
}

// Elevation above the local horizon (positive = upper limb clears the terrain).
function clearance(el, az, radius, horizon) {
  const out = new Float32Array(el.length)
  for (let k = 0; k < el.length; k++) out[k] = el[k] + radius - horizonAt(horizon, az[k])
  return out
}

// Time (hours) from sample i until the sign of the clearance flips; null if no flip in the series.
function hoursToFlip(clr, i, stepMin) {
  const up = clr[i] > 0
  for (let k = i + 1; k < clr.length; k++) {
    if (clr[k] > 0 !== up) {
      const a = clr[k - 1], b = clr[k]
      const f = a === b ? 0 : a / (a - b)
      return ((k - 1 - i + f) * stepMin) / 60
    }
  }
  return null
}

function longestRun(pred, from, to) {
  let best = 0, cur = 0
  for (let k = from; k < to; k++) {
    cur = pred(k) ? cur + 1 : 0
    if (cur > best) best = cur
  }
  return best
}

/** Per-sample clearances for a series and horizon (memoize this: it is reused by metrics and charts). */
export function clearances(series, horizon) {
  return {
    sun: clearance(series.sunEl, series.sunAz, SUN_RADIUS_DEG, horizon),
    earth: clearance(series.earthEl, series.earthAz, EARTH_RADIUS_DEG, horizon),
  }
}

/** Operational metrics at series index i, looking `windowDays` ahead. */
export function metricsAt(series, i, horizon, windowDays = 14, clr = clearances(series, horizon)) {
  const { sunEl, stepMin } = series
  const end = Math.min(sunEl.length, i + Math.round((windowDays * 24 * 60) / stepMin))
  let sunCount = 0, earthCount = 0, bothCount = 0, maxSun = -90
  for (let k = i; k < end; k++) {
    const s = clr.sun[k] > 0, e = clr.earth[k] > 0
    if (s) sunCount++
    if (e) earthCount++
    if (s && e) bothCount++
    if (sunEl[k] > maxSun) maxSun = sunEl[k]
  }
  const total = Math.max(1, end - i)
  return {
    sunEl: sunEl[i],
    sunAz: series.sunAz[i],
    earthEl: series.earthEl[i],
    earthAz: series.earthAz[i],
    sunHorizon: horizonAt(horizon, series.sunAz[i]),
    earthHorizon: horizonAt(horizon, series.earthAz[i]),
    sunUp: clr.sun[i] > 0,
    earthUp: clr.earth[i] > 0,
    // Fraction of the solar disk above the local horizon (0..1), linear over the diameter.
    diskFraction: Math.max(0, Math.min(1, clr.sun[i] / (2 * SUN_RADIUS_DEG))),
    sunFlipHours: hoursToFlip(clr.sun, i, stepMin),
    earthFlipHours: hoursToFlip(clr.earth, i, stepMin),
    sunPct: (100 * sunCount) / total,
    earthPct: (100 * earthCount) / total,
    bothPct: (100 * bothCount) / total,
    longestSunHours: (longestRun((k) => clr.sun[k] > 0, i, end) * stepMin) / 60,
    longestDarkHours: (longestRun((k) => clr.sun[k] <= 0, i, end) * stepMin) / 60,
    maxSunEl: maxSun,
    windowDays,
  }
}

export function formatDuration(hours) {
  if (hours == null) return null
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${hours.toFixed(1)} h`
  const total = Math.round(hours)
  return `${Math.floor(total / 24)} d ${total % 24} h`
}
