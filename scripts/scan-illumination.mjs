// Finds the best-illuminated point (sunlit % over 2027) in a square around a lat/lon using LOLA DEMs.
// Usage: node scripts/scan-illumination.mjs <lat> <lon> [half-size m = 1500] [step m = 250]
import { loadDems } from './dem.mjs'
import { sunEarthAt } from '../src/lib/ephemeris.js'
const R = 1737400, DEG = Math.PI / 180, dems = loadDems()
const vec = (la, lo, r) => [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)]
function dest(lat, lon, az, d) { const s = Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(az); return [Math.asin(s), lon + Math.atan2(Math.sin(az) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * s)] }
function mask(latD, lonD) {
  const la0 = latD * DEG, lo0 = lonD * DEG, { h: h0, res } = dems.height(latD, lonD)
  const O = vec(la0, lo0, R + h0 + 2), up = vec(la0, lo0, 1), m = []
  for (let i = 0; i < 360; i++) { let b = -90
    for (let d = res; d < 300e3; d += Math.max(res * 0.75, d * 0.004)) { const [a, c] = dest(la0, lo0, i * DEG, d / R); const { h } = dems.height(a / DEG, c / DEG); const P = vec(a, c, R + h); const v = [P[0] - O[0], P[1] - O[1], P[2] - O[2]]; const e = Math.asin((v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / Math.hypot(...v)) / DEG; if (e > b) b = e }
    m.push(b) }
  return { m, h0 }
}
const [lat, lon, RAD = 1500, STEP = 250] = process.argv.slice(2).map(Number)
const sun = []; for (let h = 0; h < 365 * 24; h += 12) sun.push(sunEarthAt(new Date(Date.UTC(2027, 0, 1) + h * 3600e3), lat, lon).sun)
const res = []
for (let dy = -RAD; dy <= RAD; dy += STEP) for (let dx = -RAD; dx <= RAD; dx += STEP) {
  const la = lat + dy / R / DEG, lo = lon + dx / (R * Math.cos(lat * DEG)) / DEG
  const { m, h0 } = mask(la, lo)
  const lit = sun.filter((s) => s.el + 0.267 > m[Math.round(s.az) % 360]).length / sun.length
  res.push({ la, lo, h0, lit })
}
res.sort((a, b) => b.lit - a.lit)
for (const r of res.slice(0, 6)) console.log(r.la.toFixed(4), r.lo.toFixed(3), Math.round(r.h0), (100 * r.lit).toFixed(1) + '%')
