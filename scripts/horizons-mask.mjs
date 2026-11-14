// Computes full-resolution terrain horizon profiles for every curated site from LOLA DEMs.
// Output: public/terrain/<site>.json      Usage: npm run terrain   (needs the DEMs in data-raw/, see README)
import { mkdir, writeFile } from 'node:fs/promises'
import { SITES } from '../src/data/sites.js'
import { computeHorizon } from '../src/lib/horizonCore.js'
import { loadDems } from './dem.mjs'

const dems = loadDems()
await mkdir('public/terrain', { recursive: true })
for (const site of SITES) {
  const t = Date.now()
  const r = computeHorizon(site.lat, site.lon, dems.sample)
  await writeFile(
    `public/terrain/${site.id}.json`,
    JSON.stringify({
      source: 'LOLA GDR DEMs (80 m / 240 m south polar, 16 ppd global), ray-marched to 300 km',
      mode: 'full',
      site: { id: site.id, lat: site.lat, lon: site.lon },
      ...r,
    }),
  )
  const max = Math.max(...r.mask), maxAz = r.mask.indexOf(max) * r.azStep
  console.log(`${site.id.padEnd(18)} h=${String(r.elevationM).padStart(6)} m  res ${r.resolutionM} m  max horizon ${max.toFixed(2)}° @ ${maxAz}°  (${Date.now() - t} ms)`)
}
