// Lunar communication relay satellites: where the relay is in the sky of a landing site, and whether it can see Earth.
//
// Orbits are simplified on purpose (two-body Kepler around the Moon, or a circular halo around Earth–Moon L2).
// They are representative of real designs, not real ephemerides:
//   nrho: 9:2 near-rectilinear halo orbit like NASA's Gateway: apolune ~70 000 km over the south pole, period 6.56 d.
//   elfo: elliptical lunar frozen orbit like NASA's LCRNS relay plans: apolune over the south pole, period ~13 h.
//   halo: halo orbit around Earth–Moon L2 like CNSA's Queqiao: ~65 000 km behind the far side, ~13 000 km halo.
import { MOON_RADIUS_KM, azEl, moonFrame, rotZ, siteFrame } from './ephemeris.js'

const MU_MOON = 4902.8 // km³/s²
const RAD = Math.PI / 180
const T0 = Date.UTC(2026, 0, 1) // arbitrary orbit epoch (phase); planners would pick the real one

export const RELAYS = {
  none: { name: 'No relay (direct to Earth only)', short: 'None' },
  nrho: {
    name: 'NRHO relay (Gateway-style)', short: 'NRHO',
    kind: 'kepler', periodH: 6.56 * 24, rp: 5000, i: 90, raan: 0, argp: 90,
    about: 'Very stretched polar orbit. It hangs high above the south pole for most of its 6.5-day loop, then dives past the north pole.',
  },
  elfo: {
    name: 'Elliptical frozen orbit (LCRNS-style)', short: 'ELFO',
    kind: 'kepler', periodH: 13.2, rp: 2600, i: 56.2, raan: 0, argp: 90,
    about: 'A ~13-hour orbit tilted 56°, slowest (and longest visible) over the south pole. Several of these satellites would give near-constant coverage.',
  },
  halo: {
    name: 'Earth–Moon L2 halo (Queqiao-style)', short: 'L2 halo',
    kind: 'halo', dist: 65000, amp: 13000, periodD: 14,
    about: 'Parked beyond the far side, where it always sees both the far side and Earth. This is how China\'s Chang\'e 4 and Chang\'e 6 talked to Earth.',
  },
}

function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI
  for (let k = 0; k < 30; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= d
    if (Math.abs(d) < 1e-10) break
  }
  return E
}

// Relay position in the Moon body-fixed frame (km).
function relayBf(def, date, frame) {
  if (def.kind === 'halo') {
    const e = frame.earthBf
    const u = e.map((v) => v / Math.hypot(...e))
    // Perpendicular axes: lunar north projected off u, and their cross product.
    let z = [-u[2] * u[0], -u[2] * u[1], 1 - u[2] * u[2]]
    const zl = Math.hypot(...z) || 1
    z = z.map((v) => v / zl)
    const y = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]]
    const ph = (2 * Math.PI * (date.getTime() - T0)) / (def.periodD * 86400000)
    return [0, 1, 2].map((k) => -u[k] * def.dist + def.amp * (Math.cos(ph) * z[k] + Math.sin(ph) * y[k]))
  }
  const T = def.periodH * 3600
  const a = Math.cbrt(MU_MOON * (T / (2 * Math.PI)) ** 2)
  const e = 1 - def.rp / a
  const M = ((2 * Math.PI * ((date.getTime() - T0) / 1000)) / T) % (2 * Math.PI)
  const E = solveKepler(M, e)
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
  const r = a * (1 - e * Math.cos(E))
  const u = def.argp * RAD + nu, i = def.i * RAD, O = def.raan * RAD
  // Inertial frame aligned with the lunar equator (z = lunar pole), then rotate by the Moon's spin W.
  const inertial = [
    r * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(i)),
    r * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(i)),
    r * Math.sin(u) * Math.sin(i),
  ]
  return rotZ(inertial, frame.W)
}

// Does the straight line from relay to Earth clear the Moon?
function seesEarth(relay, earth) {
  const d = [earth[0] - relay[0], earth[1] - relay[1], earth[2] - relay[2]]
  const t = Math.max(0, Math.min(1, -(relay[0] * d[0] + relay[1] * d[1] + relay[2] * d[2]) / (d[0] ** 2 + d[1] ** 2 + d[2] ** 2)))
  return Math.hypot(relay[0] + t * d[0], relay[1] + t * d[1], relay[2] + t * d[2]) > MOON_RADIUS_KM + 50
}

/** Relay az/el from the site and whether the relay sees Earth, for every time in `ts` (ms). */
export function relaySeries(relayId, lat, lon, ts) {
  const def = RELAYS[relayId]
  if (!def || relayId === 'none') return null
  const site = siteFrame(lat, lon)
  const n = ts.length
  const az = new Float32Array(n), el = new Float32Array(n), dist = new Float32Array(n), earth = new Uint8Array(n)
  for (let k = 0; k < n; k++) {
    const date = new Date(ts[k])
    const frame = moonFrame(date)
    const r = relayBf(def, date, frame)
    const p = azEl(r, site)
    az[k] = p.az
    el[k] = p.el
    dist[k] = p.distKm
    earth[k] = seesEarth(r, frame.earthBf) ? 1 : 0
  }
  return { id: relayId, az, el, dist, earth }
}
