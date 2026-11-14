// Topocentric Sun / Earth positions for an observer standing on the Moon.
//
// Method:
//  1. astronomy-engine (VSOP87 + ELP/MPP02-class lunar theory) gives geocentric J2000 vectors
//     of the Sun and the Moon.
//  2. Moon->Sun and Moon->Earth vectors are rotated into the Moon body-fixed (mean Earth / polar axis)
//     frame using the IAU WGCCRE rotation model for the Moon (pole RA/Dec + prime-meridian angle W,
//     including the periodic terms, i.e. physical libration).
//  3. The observer's position on a 1737.4 km sphere is subtracted (topocentric parallax: ~1° for Earth),
//     and the result is projected onto the local East-North-Up frame.
//  No atmosphere: no refraction, the horizon is purely geometric (plus an optional terrain mask).
//
// Typical difference against JPL Horizons (DE441, airless apparent): a few hundredths of a degree.
// Run `npm run validate` to reproduce the comparison.

import * as Astronomy from 'astronomy-engine'

export const MOON_RADIUS_KM = 1737.4
export const AU_KM = 149597870.7
export const SUN_RADIUS_KM = 695700
export const EARTH_RADIUS_KM = 6378.137

const DEG = Math.PI / 180

function rotZ(v, a) {
  const c = Math.cos(a), s = Math.sin(a)
  return [c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2]]
}
function rotX(v, a) {
  const c = Math.cos(a), s = Math.sin(a)
  return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]]
}

// J2000 equatorial -> Moon body-fixed: Rz(W) · Rx(90° − δ) · Rz(90° + α)
function toMoonFixed(v, axis) {
  const alpha = axis.ra * 15 * DEG // ra is in sidereal hours
  const delta = axis.dec * DEG
  const W = axis.spin * DEG
  return rotZ(rotX(rotZ(v, Math.PI / 2 + alpha), Math.PI / 2 - delta), W)
}

function siteFrame(latDeg, lonDeg) {
  const lat = Math.max(-89.9999, Math.min(89.9999, latDeg)) * DEG
  const lon = lonDeg * DEG
  const cl = Math.cos(lat), sl = Math.sin(lat), co = Math.cos(lon), so = Math.sin(lon)
  return {
    up: [cl * co, cl * so, sl],
    east: [-so, co, 0],
    north: [-sl * co, -sl * so, cl],
  }
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a) => Math.hypot(a[0], a[1], a[2])

function azEl(vecKm, frame) {
  const d = [
    vecKm[0] - frame.up[0] * MOON_RADIUS_KM,
    vecKm[1] - frame.up[1] * MOON_RADIUS_KM,
    vecKm[2] - frame.up[2] * MOON_RADIUS_KM,
  ]
  const r = norm(d)
  const el = Math.asin(dot(d, frame.up) / r) / DEG
  let az = Math.atan2(dot(d, frame.east), dot(d, frame.north)) / DEG
  if (az < 0) az += 360
  return { az, el, distKm: r }
}

/**
 * Sun and Earth as seen from (lat, lon) on the Moon at a JS Date.
 * Returns azimuth (deg, from north through east), elevation (deg), distance and angular radius.
 */
export function sunEarthAt(date, lat, lon) {
  const t = Astronomy.MakeTime(date)
  const moon = Astronomy.GeoVector(Astronomy.Body.Moon, t, false)
  // Sun position evaluated at t − light time (≈ 8.3 min); the Moon frame is evaluated at reception time t.
  const tSun = t.AddDays(-499.0 / 86400)
  const sun = Astronomy.GeoVector(Astronomy.Body.Sun, tSun, false)
  const axis = Astronomy.RotationAxis(Astronomy.Body.Moon, t)

  const moonToSun = [(sun.x - moon.x) * AU_KM, (sun.y - moon.y) * AU_KM, (sun.z - moon.z) * AU_KM]
  const moonToEarth = [-moon.x * AU_KM, -moon.y * AU_KM, -moon.z * AU_KM]

  const frame = siteFrame(lat, lon)
  const s = azEl(toMoonFixed(moonToSun, axis), frame)
  const e = azEl(toMoonFixed(moonToEarth, axis), frame)
  return {
    sun: { ...s, radiusDeg: Math.asin(SUN_RADIUS_KM / s.distKm) / DEG },
    earth: { ...e, radiusDeg: Math.asin(EARTH_RADIUS_KM / e.distKm) / DEG },
  }
}
