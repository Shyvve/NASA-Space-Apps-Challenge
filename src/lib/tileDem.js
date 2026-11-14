// Multi-resolution LOLA tile reader for "quick" terrain mode (browser), also usable from Node for validation.
// Tiers: near the site use the finest grid available, farther away coarser grids (the far horizon is
// dominated by big relief, and a pixel subtends a small angle at long range).
import { bilinearDN, computeHorizon, cylPixel, polarPixel } from './horizonCore.js'

const POLAR_EDGE = -75.2

export function createTileDem(manifest, loadTile) {
  const grids = Object.fromEntries(manifest.grids.map((g) => [g.id, { ...g, available: new Set(g.tiles) }]))
  const cache = new Map() // key -> Int16Array | Promise

  function tiersFor(lat, dist) {
    if (lat <= POLAR_EDGE) {
      if (dist <= 20e3) return lat <= -80 ? ['p80', 'p240', 'p480'] : ['p240', 'p480']
      return dist <= 60e3 ? ['p480'] : ['p1920']
    }
    return ['g8']
  }

  function locate(g, lat, lon) {
    let { col, row } = g.type === 'polar' ? polarPixel(lat, lon, g.scaleM, g.offsetPx) : cylPixel(lat, lon, g.ppd)
    const W = g.type === 'polar' ? g.size : g.width, H = g.type === 'polar' ? g.size : g.height
    if (g.type === 'cyl') {
      if (col < 0) col += W
      row = Math.max(0, Math.min(row, H - 1))
    }
    if (col < 0 || row < 0 || col > W - 1 || row > H - 1) return null
    const tr = Math.floor(row / g.tileH), tc = Math.floor(col / g.tileW)
    const key = `${tr}_${tc}`
    if (!g.available.has(key)) return null
    const tw = Math.min(g.tileW, W - tc * g.tileW), th = Math.min(g.tileH, H - tr * g.tileH)
    return { key: `${g.id}/${key}`, tw, th, col: col - tc * g.tileW, row: row - tr * g.tileH }
  }

  // collect: if set, only record which tiles would be read (used before downloading).
  function makeSampler(collect) {
    return (lat, lon, dist) => {
      for (const id of tiersFor(lat, dist)) {
        const g = grids[id]
        const loc = locate(g, lat, lon)
        if (!loc) continue
        if (collect) {
          collect.add(loc.key)
          return { h: 0, res: g.scaleM }
        }
        const t = cache.get(loc.key)
        if (!(t instanceof Int16Array)) return null
        return { h: bilinearDN(t, loc.tw, loc.th, Math.min(loc.col, loc.tw - 1), Math.min(loc.row, loc.th - 1)), res: g.scaleM }
      }
      return null
    }
  }

  return {
    /** Downloads every tile the horizon computation will touch. Returns { tiles, bytes } downloaded now. */
    async prepare(lat, lon, onProgress) {
      const keys = new Set()
      computeHorizon(lat, lon, makeSampler(keys))
      const todo = [...keys].filter((k) => !cache.has(k))
      let done = 0, bytes = 0
      await Promise.all(
        todo.map(async (k) => {
          const p = loadTile(k)
          cache.set(k, p)
          const arr = await p
          cache.set(k, arr)
          bytes += arr.byteLength
          onProgress?.(++done, todo.length, bytes)
        }),
      )
      return { tiles: todo.length, bytes, total: keys.size }
    },
    compute(lat, lon) {
      return computeHorizon(lat, lon, makeSampler(null))
    },
  }
}
