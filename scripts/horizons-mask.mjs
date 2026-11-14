// Computes a terrain horizon mask (horizon elevation for every azimuth) for each curated site
// by ray-marching LOLA DEMs on a sphere. Output: public/terrain/<site>.json
// Usage: npm run terrain   (needs the DEMs in data-raw/, see README)
import { mkdir, writeFile } from 'node:fs/promises'
import { SITES } from '../src/data/sites.js'
import { loadDems } from './dem.mjs'

const R = 1737400
const DEG = Math.PI / 180
const AZ_STEP = 0.5 // degrees
const MAX_DIST = 300e3 // m; beyond this, far terrain rarely clears the curvature drop
const OBSERVER_HEIGHT = 2 // m above the surface (solar array / antenna height)

const dems = loadDems()

const vec = (lat, lon, r) => [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)]

// Destination point on a sphere: start (lat, lon) in rad, azimuth from north in rad, angular distance in rad.
function destination(lat, lon, az, delta) {
  const sinLat = Math.sin(lat) * Math.cos(delta) + Math.cos(lat) * Math.sin(delta) * Math.cos(az)
  const lat2 = Math.asin(sinLat)
  const lon2 = lon + Math.atan2(Math.sin(az) * Math.sin(delta) * Math.cos(lat), Math.cos(delta) - Math.sin(lat) * sinLat)
  return [lat2, lon2]
}

function horizonFor(site) {
  const lat0 = site.lat * DEG, lon0 = site.lon * DEG
  const { h: h0, res } = dems.height(site.lat, site.lon)
  const O = vec(lat0, lon0, R + h0 + OBSERVER_HEIGHT)
  const up = vec(lat0, lon0, 1)
  const n = Math.round(360 / AZ_STEP)
  const mask = new Array(n)
  for (let i = 0; i < n; i++) {
    const az = i * AZ_STEP * DEG
    let best = -90
    // Step grows with distance: fine near the site, coarser far away (angular error stays small).
    for (let d = res; d < MAX_DIST; d += Math.max(res * 0.75, d * 0.004)) {
      const [la, lo] = destination(lat0, lon0, az, d / R)
      const { h } = dems.height(la / DEG, lo / DEG)
      if (h == null || Number.isNaN(h)) break
      const P = vec(la, lo, R + h)
      const v = [P[0] - O[0], P[1] - O[1], P[2] - O[2]]
      const el = Math.asin((v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / Math.hypot(...v)) / DEG
      if (el > best) best = el
    }
    mask[i] = Math.round(best * 100) / 100
  }
  return { elevationM: Math.round(h0), resolutionM: Math.round(res), mask }
}

await mkdir('public/terrain', { recursive: true })
for (const site of SITES) {
  const t = Date.now()
  const r = horizonFor(site)
  await writeFile(
    `public/terrain/${site.id}.json`,
    JSON.stringify({
      source: 'LOLA GDR DEMs (80 m / 240 m south polar, 16 ppd global), ray-marched to 300 km',
      site: { id: site.id, lat: site.lat, lon: site.lon },
      azStep: AZ_STEP,
      observerHeightM: OBSERVER_HEIGHT,
      ...r,
    }),
  )
  const max = Math.max(...r.mask), maxAz = r.mask.indexOf(max) * AZ_STEP
  console.log(`${site.id.padEnd(18)} h=${String(r.elevationM).padStart(6)} m  res ${r.resolutionM} m  max horizon ${max.toFixed(2)}° @ ${maxAz}°  (${Date.now() - t} ms)`)
}
