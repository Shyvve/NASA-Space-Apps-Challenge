// ---------------------------------------------------------------------------------------------------------
// Lunar Landing Site Navigator: offline precise terrain kit
//
//   node lunar-horizon-kit.mjs <lat> <lon> [--out horizon.json] [--height 2]
//
// Latitude in degrees (north +), longitude in degrees east. Needs Node.js 18+.
// First run downloads LOLA DEMs from NASA PDS into ./lola-data (33 MB global, +29 MB / +115 MB near the south pole).
// Then drop the produced JSON onto the website ("Import precise terrain").
// ---------------------------------------------------------------------------------------------------------

// ===== horizon core (generated from src/lib/horizonCore.js) =====
// Terrain horizon ray-marcher shared by the browser (quick mode), the Node build scripts and the offline kit.
// No imports on purpose: scripts/build-kit.mjs inlines this file into a single downloadable script.

const MOON_R_M = 1737400
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
function computeHorizon(latDeg, lonDeg, sample, { azStep = 0.5, maxDist = 300e3, observerHeight = 2 } = {}) {
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
function bilinearDN(data, width, height, col, row) {
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
function polarPixel(latDeg, lonDeg, scaleM, offsetPx) {
  const k = 2 * MOON_R_M * Math.tan(Math.PI / 4 + (latDeg * RAD) / 2)
  return { col: offsetPx + (k * Math.sin(lonDeg * RAD)) / scaleM, row: offsetPx - (k * Math.cos(lonDeg * RAD)) / scaleM }
}

/** Simple cylindrical grid position, longitudes 0..360 east, `ppd` pixels per degree. */
function cylPixel(latDeg, lonDeg, ppd) {
  const lonE = ((lonDeg % 360) + 360) % 360
  return { col: lonE * ppd - 0.5, row: (90 - latDeg) * ppd - 0.5 }
}

// ===== CLI =====
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const PDS = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr'
const DIR = 'lola-data'
const FILES = {
  global: { path: 'cylindrical/img/ldem_16.img', bytes: 33177600, ppd: 16 },
  mid: { path: 'polar/img/ldem_75s_240m.img', bytes: 29062688, size: 3812, scale: 240, offset: 1905.5, maxLat: -75 },
  fine: { path: 'polar/img/ldem_80s_80m.img', bytes: 115520000, size: 7600, scale: 80, offset: 3799.5, maxLat: -80 },
}

async function ensure(f) {
  const name = f.path.split('/').pop()
  const dest = DIR + '/' + name
  if (existsSync(dest) && readFileSync(dest).length === f.bytes) return dest
  mkdirSync(DIR, { recursive: true })
  process.stderr.write('Downloading ' + name + ' (' + (f.bytes / 1e6).toFixed(0) + ' MB) from NASA PDS...\n')
  const res = await fetch(PDS + '/' + f.path)
  if (!res.ok) throw new Error('Download failed: ' + res.status + ' ' + f.path)
  let got = 0, last = 0
  const body = Readable.fromWeb(res.body)
  body.on('data', (c) => {
    got += c.length
    const pct = Math.floor((100 * got) / f.bytes)
    if (pct >= last + 10) { last = pct; process.stderr.write('  ' + pct + '%\n') }
  })
  await pipeline(body, createWriteStream(dest + '.part'))
  renameSync(dest + '.part', dest)
  return dest
}

const int16 = (p) => { const b = readFileSync(p); return new Int16Array(b.buffer, b.byteOffset, b.byteLength / 2) }

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d }
const out = opt('--out', null)
const observerHeight = Number(opt('--height', 2))
const [lat, lon] = args.map(Number)
if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) {
  console.error('Usage: node lunar-horizon-kit.mjs <lat> <lon> [--out horizon.json] [--height 2]')
  process.exit(1)
}

const layers = []
// Polar DEMs are only needed if rays (300 km) can reach the 75°S cap.
if (lat < -64) {
  if (lat < -70) {
    const f = FILES.fine
    const d = int16(await ensure(f))
    layers.push({ res: f.scale, h: (la, lo) => (la > f.maxLat ? null : (() => { const p = polarPixel(la, lo, f.scale, f.offset); return bilinearDN(d, f.size, f.size, p.col, p.row) })()) })
  }
  const f = FILES.mid
  const d = int16(await ensure(f))
  layers.push({ res: f.scale, h: (la, lo) => (la > f.maxLat ? null : (() => { const p = polarPixel(la, lo, f.scale, f.offset); return bilinearDN(d, f.size, f.size, p.col, p.row) })()) })
}
{
  const f = FILES.global, W = 360 * f.ppd, H = 180 * f.ppd
  const d = int16(await ensure(f))
  layers.push({
    res: (2 * Math.PI * MOON_R_M) / W,
    h: (la, lo) => { let p = cylPixel(la, lo, f.ppd); let c = p.col < 0 ? p.col + W : p.col; return bilinearDN(d, W, H, Math.min(c, W - 1), Math.max(0, Math.min(p.row, H - 1))) },
  })
}
const sample = (la, lo) => { for (const L of layers) { const h = L.h(la, lo); if (h != null) return { h, res: L.res } } return null }

process.stderr.write('Ray-tracing 720 azimuths out to 300 km...\n')
const r = computeHorizon(lat, lon, sample, { observerHeight })
const json = JSON.stringify({
  source: 'LOLA GDR full-resolution DEMs (offline kit), ray-marched to 300 km',
  mode: 'precise',
  site: { id: 'custom', lat, lon },
  ...r,
})
if (out) { writeFileSync(out, json); process.stderr.write('Saved ' + out + '\n') } else console.log(json)
const max = Math.max(...r.mask)
process.stderr.write('Surface ' + r.elevationM + ' m, DEM ' + r.resolutionM + ' m/px, highest horizon ' + max.toFixed(2) + ' deg at az ' + (r.mask.indexOf(max) * r.azStep) + '\n')
