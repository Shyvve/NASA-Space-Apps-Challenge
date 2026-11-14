// Fraction of time the Sun's upper limb clears the terrain horizon over one year (sanity check vs literature).
import { readFileSync } from 'node:fs'
import { SITES } from '../src/data/sites.js'
import { sunEarthAt } from '../src/lib/ephemeris.js'
const ids = process.argv.slice(2)
for (const s of SITES.filter((x) => !ids.length || ids.includes(x.id))) {
  const t = JSON.parse(readFileSync(`public/terrain/${s.id}.json`, 'utf8'))
  let lit = 0, earth = 0, n = 0
  for (let h = 0; h < 365 * 24; h += 6) {
    const r = sunEarthAt(new Date(Date.UTC(2027, 0, 1) + h * 3600e3), s.lat, s.lon)
    const m = (az) => t.mask[Math.round(az / t.azStep) % t.mask.length]
    if (r.sun.el + 0.267 > m(r.sun.az)) lit++
    if (r.earth.el + 0.95 > m(r.earth.az)) earth++
    n++
  }
  console.log(`${s.id.padEnd(18)} sunlit ${(100 * lit / n).toFixed(1)}%  earth ${(100 * earth / n).toFixed(1)}%`)
}
