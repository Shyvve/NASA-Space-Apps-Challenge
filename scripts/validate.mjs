// Compares the in-browser ephemeris against the downloaded JPL Horizons tables.
// Usage: npm run validate
import { readFile } from 'node:fs/promises'
import { SITES } from '../src/data/sites.js'
import { sunEarthAt } from '../src/lib/ephemeris.js'

const EVERY = 12 // check every 12th sample (= daily) to keep it quick
let worst = { sun: 0, earth: 0 }
let sumSq = { sun: 0, earth: 0 }, n = 0

for (const site of SITES) {
  const h = JSON.parse(await readFile(`public/horizons/${site.id}.json`, 'utf8'))
  const t0 = Date.parse(h.start)
  let siteWorst = { sun: 0, earth: 0 }
  for (let i = 0; i < h.sun.el.length; i += EVERY) {
    const r = sunEarthAt(new Date(t0 + i * h.stepHours * 3600000), site.lat, site.lon)
    for (const b of ['sun', 'earth']) {
      const d = Math.abs(r[b].el - h[b].el[i] / h.scale.el)
      siteWorst[b] = Math.max(siteWorst[b], d)
      sumSq[b] += d * d
    }
    n++
  }
  worst.sun = Math.max(worst.sun, siteWorst.sun)
  worst.earth = Math.max(worst.earth, siteWorst.earth)
  console.log(`${site.id.padEnd(18)} max |Δel| Sun ${siteWorst.sun.toFixed(4)}°  Earth ${siteWorst.earth.toFixed(4)}°`)
}
console.log(`\nAll sites (${n} epochs): max |Δel| Sun ${worst.sun.toFixed(4)}°, Earth ${worst.earth.toFixed(4)}°; ` +
  `RMS Sun ${Math.sqrt(sumSq.sun / n).toFixed(4)}°, Earth ${Math.sqrt(sumSq.earth / n).toFixed(4)}°`)
