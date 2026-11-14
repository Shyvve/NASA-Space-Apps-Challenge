// Web Worker: illumination / Earth-visibility map on a grid around a site, using quick-mode LOLA tiles.
// in:  { base, lat, lon, spacingM, n, sun: [[az, el]...], earth: [[az, el]...] }
// out: { type: 'progress', done, total } ... { type: 'done', cells: [{ i, j, lat, lon, sun, earth, both, h }] }
import { createTileDem } from './tileDem.js'

const R = 1737400, RAD = Math.PI / 180
const SUN_R = 0.267, EARTH_R = 0.95
let dem = null

self.onmessage = async (e) => {
  const { base, lat, lon, spacingM, n, sun, earth } = e.data
  try {
    if (!dem) {
      const manifest = await fetch(`${base}dem/manifest.json`).then((r) => r.json())
      dem = createTileDem(manifest, (key) => fetch(`${base}dem/${key}.bin`).then((r) => r.arrayBuffer()).then((b) => new Int16Array(b)))
    }
    const half = (n - 1) / 2
    const total = n * n
    const cells = []
    const opts = { azStep: 2, maxDist: 150e3 }
    // Download everything first (the rays of neighbouring points touch the same tiles).
    await dem.prepare(lat, lon, null, opts)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const dn = (half - i) * spacingM, de = (j - half) * spacingM
        const la = lat + dn / R / RAD
        const lo = lon + de / (R * Math.cos(lat * RAD)) / RAD
        await dem.prepare(la, lo, null, opts)
        const h = dem.compute(la, lo, opts)
        const m = (az) => h.mask[Math.round((((az % 360) + 360) % 360) / h.azStep) % h.mask.length]
        let s = 0, ea = 0, b = 0
        for (let k = 0; k < sun.length; k++) {
          const su = sun[k][1] + SUN_R > m(sun[k][0])
          const eu = earth[k][1] + EARTH_R > m(earth[k][0])
          if (su) s++
          if (eu) ea++
          if (su && eu) b++
        }
        cells.push({ i, j, lat: la, lon: lo, h: h.elevationM, sun: (100 * s) / sun.length, earth: (100 * ea) / sun.length, both: (100 * b) / sun.length })
        self.postMessage({ type: 'progress', done: cells.length, total })
      }
    }
    self.postMessage({ type: 'done', cells })
  } catch (err) {
    self.postMessage({ type: 'error', error: err.message })
  }
}
