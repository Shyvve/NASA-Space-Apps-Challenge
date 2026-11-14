// Quick terrain mode: downloads only the LOLA tiles around a point and ray-traces the horizon in the browser.
import { createTileDem } from './tileDem.js'

const BASE = import.meta.env.BASE_URL
let demPromise = null

function getDem() {
  demPromise ??= fetch(`${BASE}dem/manifest.json`)
    .then((r) => {
      if (!r.ok) throw new Error('Terrain tiles are not available')
      return r.json()
    })
    .then((manifest) =>
      createTileDem(manifest, (key) =>
        fetch(`${BASE}dem/${key}.bin`)
          .then((r) => {
            if (!r.ok) throw new Error(`Missing tile ${key}`)
            return r.arrayBuffer()
          })
          .then((b) => new Int16Array(b)),
      ),
    )
    .catch((e) => {
      demPromise = null
      throw e
    })
  return demPromise
}

/** Typical accuracy of quick mode vs. full resolution (from scripts/validate-quick.mjs). */
export function quickAccuracy(lat) {
  if (lat <= -87.5) return 'about 0.05° (80 m LOLA near the site)'
  if (lat <= -83.5) return 'about 0.1–0.8° (240 m LOLA near the site)'
  return 'about 0.1–1° (3.8 km LOLA)'
}

export async function quickTerrain(lat, lon, onProgress) {
  const dem = await getDem()
  const download = await dem.prepare(lat, lon, onProgress)
  await new Promise((r) => setTimeout(r)) // let the UI paint "computing" before the synchronous ray-march
  const r = dem.compute(lat, lon)
  return {
    source: 'LOLA tiles, multi-resolution (quick mode, computed in the browser)',
    mode: 'quick',
    site: { id: 'custom', lat, lon },
    download,
    ...r,
  }
}

/** Validates a horizon JSON produced by the offline kit. Throws with a readable message. */
export function parseTerrainFile(text) {
  let j
  try {
    j = JSON.parse(text)
  } catch {
    throw new Error('Not a JSON file')
  }
  if (!Array.isArray(j.mask) || !j.mask.length || !j.azStep || !j.site) throw new Error('Not a horizon file from the offline kit')
  if (Math.abs(j.mask.length * j.azStep - 360) > 1e-6) throw new Error('Horizon profile does not cover 360°')
  if (!j.mask.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90)) throw new Error('Horizon values out of range')
  return { ...j, mode: j.mode || 'precise' }
}
