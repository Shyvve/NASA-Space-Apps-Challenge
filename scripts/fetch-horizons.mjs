// Downloads JPL Horizons airless apparent Az/El of the Sun (10) and Earth (399)
// as seen from every curated site, and stores them in public/horizons/<site>.json.
// Usage: npm run fetch-horizons
import { writeFile, mkdir } from 'node:fs/promises'
import { SITES } from '../src/data/sites.js'

export const START = '2026-11-01'
export const STOP = '2027-12-31'
const STEP_HOURS = 2
const API = 'https://ssd.jpl.nasa.gov/api/horizons.api'

async function query(target, site) {
  const lonE = ((site.lon % 360) + 360) % 360
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: `'${target}'`,
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${lonE},${site.lat},0'`,
    START_TIME: `'${START}'`,
    STOP_TIME: `'${STOP}'`,
    STEP_SIZE: `'${STEP_HOURS}h'`,
    QUANTITIES: "'4'",
    CSV_FORMAT: "'YES'",
    ANG_FORMAT: "'DEG'",
    APPARENT: "'AIRLESS'",
  })
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${API}?${params}`)
    if (res.ok) {
      const text = await res.text()
      const body = text.split('$$SOE')[1]?.split('$$EOE')[0]
      if (!body) throw new Error(`No ephemeris in Horizons reply for ${site.id}/${target}:\n${text.slice(0, 500)}`)
      const az = [], el = []
      for (const line of body.trim().split('\n')) {
        const cols = line.split(',').map((c) => c.trim())
        az.push(Math.round(parseFloat(cols[3]) * 1000))
        el.push(Math.round(parseFloat(cols[4]) * 10000))
      }
      return { az, el }
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt))
  }
  throw new Error(`Horizons request failed for ${site.id}/${target}`)
}

await mkdir('public/horizons', { recursive: true })
const only = process.argv.slice(2)
for (const site of SITES.filter((s) => !only.length || only.includes(s.id))) {
  const sun = await query('10', site)
  const earth = await query('399', site)
  const out = {
    source: 'JPL Horizons (DE441), airless apparent topocentric Az/El',
    site: { id: site.id, lat: site.lat, lon: site.lon },
    start: `${START}T00:00:00Z`,
    stepHours: STEP_HOURS,
    scale: { az: 1000, el: 10000 },
    sun,
    earth,
  }
  await writeFile(`public/horizons/${site.id}.json`, JSON.stringify(out))
  console.log(`${site.id}: ${sun.az.length} samples`)
}
