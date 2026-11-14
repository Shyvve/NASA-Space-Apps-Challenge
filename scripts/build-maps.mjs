// Renders shaded-relief map images from LOLA DEMs for the clickable site picker.
//   public/maps/south-pole.png  polar stereographic, ±EXTENT km around the pole, Earth-facing (0°E) up
//   public/maps/moon.png        equirectangular, 180°W..180°E, 90°N..90°S
// Usage: npm run maps   (needs the DEMs in data-raw/)
import { mkdir, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import { DEM_FILES, cylDem, polarDem } from './dem.mjs'

const R = 1737400
export const POLE_EXTENT_KM = 320
const RAD = Math.PI / 180

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3)
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

// Elevation colour ramp (m): deep crater floors blue-grey, highlands warm grey.
const RAMP = [[-6000, [38, 48, 72]], [-3000, [70, 78, 96]], [0, [128, 124, 118]], [3000, [176, 166, 148]], [6000, [222, 212, 190]]]
function ramp(h) {
  if (h <= RAMP[0][0]) return RAMP[0][1]
  for (let i = 1; i < RAMP.length; i++) {
    if (h <= RAMP[i][0]) {
      const [h0, c0] = RAMP[i - 1], [h1, c1] = RAMP[i]
      const f = (h - h0) / (h1 - h0)
      return c0.map((v, k) => v + (c1[k] - v) * f)
    }
  }
  return RAMP[RAMP.length - 1][1]
}

// heights: Float32Array w*h, pixel size in metres (dx, dy may vary per row for equirectangular).
function shade(heights, w, h, dxOf, dy) {
  const out = Buffer.alloc(w * h * 3)
  const az = 315 * RAD, alt = 40 * RAD
  const L = [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)]
  for (let y = 0; y < h; y++) {
    const dx = dxOf(y)
    for (let x = 0; x < w; x++) {
      const hc = heights[y * w + x]
      const hx = (heights[y * w + Math.min(w - 1, x + 1)] - heights[y * w + Math.max(0, x - 1)]) / (2 * dx) * 1.6
      const hy = (heights[Math.max(0, y - 1) * w + x] - heights[Math.min(h - 1, y + 1) * w + x]) / (2 * dy) * 1.6
      const n = [-hx, -hy, 1]
      const nl = Math.hypot(...n)
      const lit = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / nl)
      const k = 0.35 + 0.85 * lit
      const c = ramp(hc)
      for (let i = 0; i < 3; i++) out[(y * w + x) * 3 + i] = Math.max(0, Math.min(255, Math.round(c[i] * k)))
    }
  }
  return out
}

await mkdir('public/maps', { recursive: true })

// South pole: pixel (px, py) -> stereographic (x, y) metres -> DEM.
{
  const f = DEM_FILES.mid
  const dem = polarDem(`data-raw/${f.file}`, f.size, f.scale, f.offset, f.maxLat)
  const fine = polarDem(`data-raw/${DEM_FILES.fine.file}`, DEM_FILES.fine.size, DEM_FILES.fine.scale, DEM_FILES.fine.offset, DEM_FILES.fine.maxLat)
  const W = 1024, m = (2 * POLE_EXTENT_KM * 1000) / W
  const hts = new Float32Array(W * W)
  for (let py = 0; py < W; py++)
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5 - W / 2) * m, y = (W / 2 - py - 0.5) * m
      const k = Math.hypot(x, y)
      const lat = (2 * (Math.atan(k / (2 * R)) - Math.PI / 4)) / RAD
      const lon = Math.atan2(x, y) / RAD
      hts[py * W + px] = fine.height(lat, lon) ?? dem.height(lat, lon) ?? 0
    }
  await writeFile('public/maps/south-pole.png', png(W, W, shade(hts, W, W, () => m, m)))
  console.log(`south-pole.png ${W}x${W}, ${m.toFixed(0)} m/px, ±${POLE_EXTENT_KM} km`)
}

// Whole Moon, equirectangular 180°W..180°E.
{
  const dem = cylDem(`data-raw/${DEM_FILES.global.file}`, DEM_FILES.global.ppd)
  const W = 2048, H = 1024
  const hts = new Float32Array(W * H)
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const lon = -180 + ((px + 0.5) / W) * 360, lat = 90 - ((py + 0.5) / H) * 180
      hts[py * W + px] = dem.height(lat, lon)
    }
  const dy = (Math.PI * R) / H
  const dxOf = (py) => Math.max(dy * 0.05, ((2 * Math.PI * R) / W) * Math.cos((90 - ((py + 0.5) / H) * 180) * RAD))
  await writeFile('public/maps/moon.png', png(W, H, shade(hts, W, H, dxOf, dy)))
  console.log(`moon.png ${W}x${H}`)
}
