// Readers for LOLA gridded DEMs (PDS LOLA GDR, int16 LSB, height = DN * 0.5 m above 1737.4 km sphere).
import { readFileSync } from 'node:fs'

const R = 1737400
const DEG = Math.PI / 180

function loadInt16(path) {
  const buf = readFileSync(path)
  return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)
}

function bilinear(data, width, height, col, row) {
  if (col < 0 || row < 0 || col > width - 1 || row > height - 1) return null
  const c0 = Math.floor(col), r0 = Math.floor(row)
  const c1 = Math.min(c0 + 1, width - 1), r1 = Math.min(r0 + 1, height - 1)
  const fc = col - c0, fr = row - r0
  const v = (r, c) => data[r * width + c]
  const top = v(r0, c0) * (1 - fc) + v(r0, c1) * fc
  const bot = v(r1, c0) * (1 - fc) + v(r1, c1) * fc
  return (top * (1 - fr) + bot * fr) * 0.5
}

/** South polar stereographic DEM (PDS DSMAP_POLAR conventions). */
export function polarDem(path, size, scaleM, offsetPx, maxLat) {
  const data = loadInt16(path)
  return {
    scaleM,
    maxLat,
    height(lat, lon) {
      if (lat > maxLat) return null
      const k = 2 * R * Math.tan(Math.PI / 4 + (lat * DEG) / 2)
      const x = k * Math.sin(lon * DEG)
      const y = k * Math.cos(lon * DEG)
      // Rows grow away from the 180° meridian (checked against the global DEM: mean |Δh| ≈ 50 m).
      return bilinear(data, size, size, offsetPx + x / scaleM, offsetPx - y / scaleM)
    },
  }
}

/** Global simple-cylindrical DEM, `ppd` pixels per degree, longitudes 0..360 east. */
export function cylDem(path, ppd) {
  const data = loadInt16(path)
  const width = 360 * ppd, height = 180 * ppd
  return {
    scaleM: (2 * Math.PI * R) / width,
    height(lat, lon) {
      const lonE = ((lon % 360) + 360) % 360
      let col = lonE * ppd - 0.5
      if (col < 0) col += width
      const row = (90 - lat) * ppd - 0.5
      return bilinear(data, width, height, Math.min(col, width - 1), Math.max(0, Math.min(row, height - 1)))
    },
  }
}

export function loadDems(dir = 'data-raw') {
  const fine = polarDem(`${dir}/ldem_80s_80m.img`, 7600, 80, 3799.5, -80)
  const mid = polarDem(`${dir}/ldem_75s_240m.img`, 3812, 240, 1905.5, -75)
  const global = cylDem(`${dir}/ldem_16.img`, 16)
  return {
    fine, mid, global,
    /** Best available height (m) and the resolution used. */
    height(lat, lon) {
      for (const d of [fine, mid]) {
        const h = d.height(lat, lon)
        if (h != null) return { h, res: d.scaleM }
      }
      return { h: global.height(lat, lon), res: global.scaleM }
    },
  }
}
