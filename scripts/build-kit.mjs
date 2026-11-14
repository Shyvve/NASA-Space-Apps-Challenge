// Builds the downloadable offline kit: one self-contained Node script (no npm install needed) that downloads
// full-resolution LOLA DEMs from NASA PDS and computes a precise horizon profile for any coordinates.
// Output: public/kit/lunar-horizon-kit.mjs      Usage: npm run kit
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const core = (await readFile('src/lib/horizonCore.js', 'utf8')).replace(/^export /gm, '')

const cli = String.raw`
// ---------------------------------------------------------------------------------------------------------
// Lunar Landing Site Navigator: offline precise terrain kit
//
//   node lunar-horizon-kit.mjs <lat> <lon> [--out horizon.json] [--height 2]
//
// Latitude in degrees (north +), longitude in degrees east. Needs Node.js 18+.
// First run downloads LOLA DEMs from NASA PDS into ./lola-data (33 MB global, +29 MB / +115 MB near the south pole).
// Then drop the produced JSON onto the website ("Import precise terrain").
// ---------------------------------------------------------------------------------------------------------
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
`

await mkdir('public/kit', { recursive: true })
await writeFile('public/kit/lunar-horizon-kit.mjs', cli.trimStart().replace(/^(\/\/ -{10,}[\s\S]*?\/\/ -{10,}\n)/, '$1\n// ===== horizon core (generated from src/lib/horizonCore.js) =====\n' + core + '\n// ===== CLI =====\n'))
console.log('public/kit/lunar-horizon-kit.mjs written')
