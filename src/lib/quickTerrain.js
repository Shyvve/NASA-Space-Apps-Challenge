// Quick terrain mode: downloads only the LOLA tiles around a point and ray-traces the horizon in the browser.
import { createTileDem } from './tileDem.js'

const BASE = import.meta.env.BASE_URL
let demPromise = null

export function getDem() {
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

// ---- Precise mode (only in the downloaded / local version, see scripts/precise-server.mjs) ----

let pingPromise = null
/** Resolves true when the app runs locally with the precise-terrain API available. */
export function hasLocalPrecise() {
  pingPromise ??= fetch('/api/precise/ping')
    .then((r) => r.ok && r.headers.get('content-type')?.includes('json'))
    .catch(() => false)
  return pingPromise
}

/** Asks the local server for a full-resolution horizon. onProgress({ status, file, pct }) while it works. */
export async function preciseTerrain(lat, lon, onProgress) {
  const r = await fetch(`/api/precise?lat=${lat}&lon=${lon}`)
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Precise terrain request failed')
  const { id } = await r.json()
  for (;;) {
    await new Promise((res) => setTimeout(res, 600))
    const job = await fetch(`/api/precise/job?id=${encodeURIComponent(id)}`).then((x) => x.json())
    if (job.status === 'done') return job.result
    if (job.status === 'error') throw new Error(job.error)
    onProgress?.(job)
  }
}
