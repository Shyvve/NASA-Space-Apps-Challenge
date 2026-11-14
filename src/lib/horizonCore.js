// Terrain horizon ray-marcher shared by the browser (quick mode), the Node build scripts and the offline kit.
// No imports on purpose: scripts/build-kit.mjs inlines this file into a single downloadable script.

export const MOON_R_M = 1737400
const RAD = Math.PI / 180

const vec = (la, lo, r) => [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)]

// Destination on a sphere from (lat, lon) [rad], azimuth [rad from north], angular distance [rad].
function destination(lat, lon, az, delta) {
  const s = Math.sin(lat) * Math.cos(delta) + Math.cos(lat) * Math.sin(delta) * Math.cos(az)
  const lat2 = Math.asin(s)
  const lon2 = lon + Math.atan2(Math.sin(az) * Math.sin(delta) * Math.cos(lat), Math.cos(delta) - Math.sin(lat) * s)
  return [lat2, lon2]
}

/**
 * Horizon elevation (deg) for every azimuth bin around (latDeg, lonDeg).
 * sample(latDeg, lonDeg, distM) must return { h, res } (height above 1737.4 km in metres, DEM resolution in metres)
 * or null where there is no data. Steps grow with distance (fine near the site, coarse far away).
 */
export function computeHorizon(latDeg, lonDeg, sample, { azStep = 0.5, maxDist = 300e3, observerHeight = 2 } = {}) {
  const lat0 = latDeg * RAD, lon0 = lonDeg * RAD
  const site = sample(latDeg, lonDeg, 0)
  if (!site) throw new Error('No terrain data at the site itself')
  const O = vec(lat0, lon0, MOON_R_M + site.h + observerHeight)
  const up = vec(lat0, lon0, 1)
  const n = Math.round(360 / azStep)
  const mask = new Array(n)
  for (let i = 0; i < n; i++) {
    const az = i * azStep * RAD
    let best = -90
    let res = site.res
    for (let d = site.res; d < maxDist; d += Math.max(res * 0.75, d * 0.004)) {
      const [la, lo] = destination(lat0, lon0, az, d / MOON_R_M)
      const p = sample(la / RAD, lo / RAD, d)
      if (!p || Number.isNaN(p.h)) break
      res = p.res
      const P = vec(la, lo, MOON_R_M + p.h)
      const v = [P[0] - O[0], P[1] - O[1], P[2] - O[2]]
      const el = Math.asin((v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / Math.hypot(v[0], v[1], v[2])) / RAD
      if (el > best) best = el
    }
    mask[i] = Math.round(best * 100) / 100
  }
  return { elevationM: Math.round(site.h), resolutionM: Math.round(site.res), azStep, observerHeightM: observerHeight, mask }
}

/** Bilinear sample of an int16 grid stored as DN (height = DN * 0.5 m). Returns null outside the grid. */
export function bilinearDN(data, width, height, col, row) {
  if (col < 0 || row < 0 || col > width - 1 || row > height - 1) return null
  const c0 = Math.floor(col), r0 = Math.floor(row)
  const c1 = Math.min(c0 + 1, width - 1), r1 = Math.min(r0 + 1, height - 1)
  const fc = col - c0, fr = row - r0
  const v = (r, c) => data[r * width + c]
  const top = v(r0, c0) * (1 - fc) + v(r0, c1) * fc
  const bot = v(r1, c0) * (1 - fc) + v(r1, c1) * fc
  return (top * (1 - fr) + bot * fr) * 0.5
}

/** South polar stereographic grid position (PDS LOLA GDR conventions, verified against the global DEM). */
export function polarPixel(latDeg, lonDeg, scaleM, offsetPx) {
  const k = 2 * MOON_R_M * Math.tan(Math.PI / 4 + (latDeg * RAD) / 2)
  return { col: offsetPx + (k * Math.sin(lonDeg * RAD)) / scaleM, row: offsetPx - (k * Math.cos(lonDeg * RAD)) / scaleM }
}

/** Simple cylindrical grid position, longitudes 0..360 east, `ppd` pixels per degree. */
export function cylPixel(latDeg, lonDeg, ppd) {
  const lonE = ((lonDeg % 360) + 360) % 360
  return { col: lonE * ppd - 0.5, row: (90 - latDeg) * ppd - 0.5 }
}
