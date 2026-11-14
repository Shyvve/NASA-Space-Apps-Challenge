// Compares quick-mode terrain (browser tiles) against the full-resolution profiles of the curated sites.
// Usage: node scripts/validate-quick.mjs
import { readFile } from 'node:fs/promises'
import { SITES } from '../src/data/sites.js'
import { createTileDem } from '../src/lib/tileDem.js'

const manifest = JSON.parse(await readFile('public/dem/manifest.json', 'utf8'))
const dem = createTileDem(manifest, async (key) => {
  const b = await readFile(`public/dem/${key}.bin`)
  return new Int16Array(b.buffer, b.byteOffset, b.byteLength / 2)
})
let worstRms = 0
for (const s of SITES) {
  const full = JSON.parse(await readFile(`public/terrain/${s.id}.json`, 'utf8'))
  const { bytes, total } = await dem.prepare(s.lat, s.lon)
  const q = dem.compute(s.lat, s.lon)
  let max = 0, sq = 0
  q.mask.forEach((v, i) => {
    const d = v - full.mask[i]
    max = Math.max(max, Math.abs(d))
    sq += d * d
  })
  const rms = Math.sqrt(sq / q.mask.length)
  worstRms = Math.max(worstRms, rms)
  console.log(`${s.id.padEnd(18)} tiles ${String(total).padStart(3)}  ${(bytes / 1e6).toFixed(2)} MB new  horizon RMS ${rms.toFixed(2)}°  max ${max.toFixed(2)}°`)
}
console.log(`worst RMS ${worstRms.toFixed(2)}°`)
