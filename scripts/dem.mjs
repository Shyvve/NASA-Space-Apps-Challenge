// Readers for full-resolution LOLA gridded DEMs (PDS LOLA GDR, int16 LSB, height = DN * 0.5 m above 1737.4 km).
import { readFileSync } from 'node:fs'
import { bilinearDN, cylPixel, polarPixel } from '../src/lib/horizonCore.js'

const R = 1737400

export function loadInt16(path) {
  const buf = readFileSync(path)
  return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)
}

/** South polar stereographic DEM. */
export function polarDem(path, size, scaleM, offsetPx, maxLat) {
  const data = loadInt16(path)
  return {
    data, size, scaleM, offsetPx, maxLat,
    height(lat, lon) {
      if (lat > maxLat) return null
      const { col, row } = polarPixel(lat, lon, scaleM, offsetPx)
      return bilinearDN(data, size, size, col, row)
    },
  }
}

/** Global simple-cylindrical DEM, `ppd` pixels per degree, longitudes 0..360 east. */
export function cylDem(path, ppd) {
  const data = loadInt16(path)
  const width = 360 * ppd, height = 180 * ppd
  return {
    data, width, height, ppd,
    scaleM: (2 * Math.PI * R) / width,
    height(lat, lon) {
      let { col, row } = cylPixel(lat, lon, ppd)
      if (col < 0) col += width
      return bilinearDN(data, width, height, Math.min(col, width - 1), Math.max(0, Math.min(row, height - 1)))
    },
  }
}

export const DEM_FILES = {
  fine: { file: 'ldem_80s_80m.img', dir: 'polar/img', size: 7600, scale: 80, offset: 3799.5, maxLat: -80 },
  mid: { file: 'ldem_75s_240m.img', dir: 'polar/img', size: 3812, scale: 240, offset: 1905.5, maxLat: -75 },
  global: { file: 'ldem_16.img', dir: 'cylindrical/img', ppd: 16 },
}

export function loadDems(dir = 'data-raw') {
  const f = DEM_FILES
  const fine = polarDem(`${dir}/${f.fine.file}`, f.fine.size, f.fine.scale, f.fine.offset, f.fine.maxLat)
  const mid = polarDem(`${dir}/${f.mid.file}`, f.mid.size, f.mid.scale, f.mid.offset, f.mid.maxLat)
  const global = cylDem(`${dir}/${f.global.file}`, f.global.ppd)
  return {
    fine, mid, global,
    /** Best available height (m) and the resolution used. Signature matches computeHorizon's sampler. */
    sample(lat, lon) {
      for (const d of [fine, mid]) {
        const h = d.height(lat, lon)
        if (h != null) return { h, res: d.scaleM }
      }
      return { h: global.height(lat, lon), res: global.scaleM }
    },
  }
}
