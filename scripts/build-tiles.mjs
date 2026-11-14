// Cuts the LOLA DEMs into small multi-resolution tiles for the in-browser "quick" terrain mode.
// Output: public/dem/manifest.json + public/dem/<grid>/<row>_<col>.bin (int16 LE DN, height = DN * 0.5 m)
// Usage: npm run tiles   (needs the DEMs in data-raw/)
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { DEM_FILES, loadInt16 } from './dem.mjs'

const OUT = 'public/dem'
const f = DEM_FILES

function downsample(data, w, h, k) {
  const W = Math.floor(w / k), H = Math.floor(h / k)
  const out = new Int16Array(W * H)
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      let s = 0
      for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) s += data[(r * k + i) * w + c * k + j]
      out[r * W + c] = Math.round(s / (k * k))
    }
  return { data: out, w: W, h: H }
}

async function writeTiles(id, grid, tw, th, keep = () => true) {
  await mkdir(`${OUT}/${id}`, { recursive: true })
  const tiles = []
  let bytes = 0
  for (let tr = 0; tr * th < grid.h; tr++)
    for (let tc = 0; tc * tw < grid.w; tc++) {
      if (!keep(tr, tc)) continue
      const w = Math.min(tw, grid.w - tc * tw), h = Math.min(th, grid.h - tr * th)
      const t = new Int16Array(w * h)
      for (let r = 0; r < h; r++) t.set(grid.data.subarray((tr * th + r) * grid.w + tc * tw, (tr * th + r) * grid.w + tc * tw + w), r * w)
      await writeFile(`${OUT}/${id}/${tr}_${tc}.bin`, Buffer.from(t.buffer))
      tiles.push(`${tr}_${tc}`)
      bytes += t.byteLength
    }
  console.log(`${id}: ${tiles.length} tiles, ${(bytes / 1e6).toFixed(1)} MB`)
  return tiles
}

await rm(OUT, { recursive: true, force: true })
const grids = []

// 80 m south polar, only within ~85 km of the pole (where it matters most and the file stays small).
{
  const size = f.fine.size, T = 256, c = f.fine.offset, rPx = 85000 / f.fine.scale
  const near = (tr, tc) => {
    const dx = Math.max(tc * T - c, 0, c - (tc * T + T)), dy = Math.max(tr * T - c, 0, c - (tr * T + T))
    return Math.hypot(dx, dy) <= rPx
  }
  const tiles = await writeTiles('p80', { data: loadInt16(`data-raw/${f.fine.file}`), w: size, h: size }, T, T, near)
  grids.push({ id: 'p80', type: 'polar', scaleM: 80, offsetPx: f.fine.offset, size, tileW: T, tileH: T, maxLat: f.fine.maxLat, tiles })
}

// 240 m south polar within ~200 km of the pole (Artemis III regions, CLPS south pole sites).
{
  const size = f.mid.size, T = 256, c = f.mid.offset, rPx = 200000 / f.mid.scale
  const near = (tr, tc) => {
    const dx = Math.max(tc * T - c, 0, c - (tc * T + T)), dy = Math.max(tr * T - c, 0, c - (tr * T + T))
    return Math.hypot(dx, dy) <= rPx
  }
  const tiles = await writeTiles('p240', { data: loadInt16(`data-raw/${f.mid.file}`), w: size, h: size }, T, T, near)
  grids.push({ id: 'p240', type: 'polar', scaleM: 240, offsetPx: f.mid.offset, size, tileW: T, tileH: T, maxLat: f.mid.maxLat, tiles })
}

// 480 m and 1920 m south polar, downsampled from the 240 m DEM (whole 75°S cap).
{
  const mid = loadInt16(`data-raw/${f.mid.file}`)
  for (const [id, k, T] of [['p480', 2, 256], ['p1920', 8, 476]]) {
    const g = downsample(mid, f.mid.size, f.mid.size, k)
    const offsetPx = (f.mid.offset - (k - 1) / 2) / k
    const tiles = await writeTiles(id, g, T, T)
    grids.push({ id, type: 'polar', scaleM: f.mid.scale * k, offsetPx, size: g.w, tileW: T, tileH: T, maxLat: f.mid.maxLat, tiles })
  }
}

// 8 px/deg global (~3.8 km), downsampled from the 16 px/deg DEM.
{
  const g = downsample(loadInt16(`data-raw/${f.global.file}`), 360 * f.global.ppd, 180 * f.global.ppd, 2)
  const tiles = await writeTiles('g8', g, 360, 180)
  grids.push({ id: 'g8', type: 'cyl', ppd: 8, width: g.w, height: g.h, scaleM: (2 * Math.PI * 1737400) / g.w, tileW: 360, tileH: 180, tiles })
}

await writeFile(`${OUT}/manifest.json`, JSON.stringify({ source: 'LOLA GDR (PDS Geosciences Node)', grids }, null, 1))
