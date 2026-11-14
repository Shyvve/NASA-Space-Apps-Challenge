// Local-only API for precise terrain: available when the app runs on your own computer (npm run dev / npm start).
// GET /api/precise/ping                 -> { ok: true }
// GET /api/precise?lat=..&lon=..        -> starts (or reuses) a job, returns { id }
// GET /api/precise/job?id=..            -> { status: 'downloading'|'computing'|'done'|'error', file, pct, result?, error? }
// Full-resolution LOLA DEMs are downloaded from NASA PDS into data-raw/ on first use.
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { computeHorizon } from '../src/lib/horizonCore.js'
import { DEM_FILES, cylDem, polarDem } from './dem.mjs'

const PDS = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr'
const DIR = 'data-raw'
const BYTES = { fine: 115520000, mid: 29062688, global: 33177600 }
const jobs = new Map()
const loaded = {}
let downloadLock = Promise.resolve()

async function ensure(key, job) {
  const f = DEM_FILES[key]
  const dest = `${DIR}/${f.file}`
  if (existsSync(dest) && statSync(dest).size === BYTES[key]) return dest
  // One download at a time, even if several jobs need the same file.
  const run = downloadLock.then(async () => {
    if (existsSync(dest) && statSync(dest).size === BYTES[key]) return
    mkdirSync(DIR, { recursive: true })
    const res = await fetch(`${PDS}/${f.dir}/${f.file}`)
    if (!res.ok) throw new Error(`NASA PDS download failed (${res.status})`)
    let got = 0
    const body = Readable.fromWeb(res.body)
    body.on('data', (c) => {
      got += c.length
      Object.assign(job, { status: 'downloading', file: f.file, pct: Math.floor((100 * got) / BYTES[key]) })
    })
    await pipeline(body, createWriteStream(`${dest}.part`))
    renameSync(`${dest}.part`, dest)
  })
  downloadLock = run.catch(() => {})
  await run
  return dest
}

async function layersFor(lat, job) {
  const layers = []
  if (lat < -64) {
    if (lat < -70) {
      await ensure('fine', job)
      loaded.fine ??= polarDem(`${DIR}/${DEM_FILES.fine.file}`, DEM_FILES.fine.size, DEM_FILES.fine.scale, DEM_FILES.fine.offset, DEM_FILES.fine.maxLat)
      layers.push(loaded.fine)
    }
    await ensure('mid', job)
    loaded.mid ??= polarDem(`${DIR}/${DEM_FILES.mid.file}`, DEM_FILES.mid.size, DEM_FILES.mid.scale, DEM_FILES.mid.offset, DEM_FILES.mid.maxLat)
    layers.push(loaded.mid)
  }
  await ensure('global', job)
  loaded.global ??= cylDem(`${DIR}/${DEM_FILES.global.file}`, DEM_FILES.global.ppd)
  layers.push(loaded.global)
  return layers
}

async function runJob(job, lat, lon) {
  try {
    const layers = await layersFor(lat, job)
    Object.assign(job, { status: 'computing', file: null, pct: 100 })
    await new Promise((r) => setTimeout(r))
    const sample = (la, lo) => {
      for (const L of layers) {
        const h = L.height(la, lo)
        if (h != null) return { h, res: L.scaleM }
      }
      return null
    }
    const r = computeHorizon(lat, lon, sample)
    job.result = { source: 'LOLA GDR full-resolution DEMs (local precise mode)', mode: 'precise', site: { id: 'custom', lat, lon }, ...r }
    job.status = 'done'
  } catch (e) {
    Object.assign(job, { status: 'error', error: e.message })
  }
}

const send = (res, code, obj) => {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(obj))
}

export function preciseMiddleware(req, res, next) {
  const url = new URL(req.url, 'http://local')
  if (!url.pathname.startsWith('/api/precise')) return next()
  if (url.pathname === '/api/precise/ping') return send(res, 200, { ok: true })
  if (url.pathname === '/api/precise/job') {
    const job = jobs.get(url.searchParams.get('id'))
    return job ? send(res, 200, job) : send(res, 404, { error: 'unknown job' })
  }
  const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) return send(res, 400, { error: 'bad coordinates' })
  const id = `${lat.toFixed(5)},${lon.toFixed(5)}`
  if (!jobs.has(id) || jobs.get(id).status === 'error') {
    const job = { id, status: 'starting', pct: 0 }
    jobs.set(id, job)
    runJob(job, lat, lon)
  }
  return send(res, 200, { id })
}

/** Vite plugin: mounts the precise-terrain API on the dev and preview servers. */
export function preciseTerrainPlugin() {
  return {
    name: 'precise-terrain',
    configureServer(server) {
      server.middlewares.use(preciseMiddleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(preciseMiddleware)
    },
  }
}
