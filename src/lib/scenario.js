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

/** Terrain horizon elevation at a given azimuth. mask = number (uniform) */
export const horizonAt = (mask) => (typeof mask === 'number' ? mask : 0)

function visibleArray(el, radius, mask) {
  const h = horizonAt(mask)
  return Array.from(el, (e) => e + radius > h)
}

// Time (hours) from sample index `i` until visibility flips; null if no flip in the series.
function hoursToFlip(vis, el, radius, mask, i, stepMin) {
  const h = horizonAt(mask)
  for (let k = i + 1; k < vis.length; k++) {
    if (vis[k] !== vis[i]) {
      const a = el[k - 1] + radius - h, b = el[k] + radius - h
      const f = a === b ? 0 : a / (a - b)
      return ((k - 1 - i + f) * stepMin) / 60
    }
  }
  return null
}

function longestRun(vis, from, to) {
  let best = 0, cur = 0
  for (let k = from; k < to; k++) {
    cur = vis[k] ? cur + 1 : 0
    if (cur > best) best = cur
  }
  return best
}

/**
 * Operational metrics at series index i, looking `windowDays` ahead.
 */
export function metricsAt(series, i, mask = 0, windowDays = 14) {
  const { sunEl, earthEl, stepMin } = series
  const sunVis = visibleArray(sunEl, SUN_RADIUS_DEG, mask)
  const earthVis = visibleArray(earthEl, EARTH_RADIUS_DEG, mask)
  const end = Math.min(sunEl.length, i + Math.round((windowDays * 24 * 60) / stepMin))
  let sunCount = 0, earthCount = 0, bothCount = 0, maxSun = -90
  for (let k = i; k < end; k++) {
    if (sunVis[k]) sunCount++
    if (earthVis[k]) earthCount++
    if (sunVis[k] && earthVis[k]) bothCount++
    if (sunEl[k] > maxSun) maxSun = sunEl[k]
  }
  const total = Math.max(1, end - i)
  // Fraction of the solar disk above the horizon (0..1), approximated linearly over the diameter.
  const h = horizonAt(mask)
  const diskFraction = Math.max(0, Math.min(1, (sunEl[i] - h + SUN_RADIUS_DEG) / (2 * SUN_RADIUS_DEG)))
  return {
    sunEl: sunEl[i],
    sunAz: series.sunAz[i],
    earthEl: earthEl[i],
    earthAz: series.earthAz[i],
    sunUp: sunVis[i],
    earthUp: earthVis[i],
    diskFraction,
    // Flat-panel power factor for a horizontally-mounted panel is ~sin(el); vertical tracking panels see ~full sun.
    powerVertical: sunVis[i] ? diskFraction : 0,
    sunFlipHours: hoursToFlip(sunVis, sunEl, SUN_RADIUS_DEG, mask, i, stepMin),
    earthFlipHours: hoursToFlip(earthVis, earthEl, EARTH_RADIUS_DEG, mask, i, stepMin),
    sunPct: (100 * sunCount) / total,
    earthPct: (100 * earthCount) / total,
    bothPct: (100 * bothCount) / total,
    longestSunHours: (longestRun(sunVis, i, end) * stepMin) / 60,
    longestDarkHours: (longestRun(sunVis.map((v) => !v), i, end) * stepMin) / 60,
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
