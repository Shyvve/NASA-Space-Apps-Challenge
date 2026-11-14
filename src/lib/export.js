import { horizonAt } from './scenario.js'

export function downloadText(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

/** Time series of the current scenario as CSV (UTC, degrees, W). */
export function exportSeriesCSV({ label, lat, lon, series, clr, horizon, power, relay, relayClr }) {
  const rows = [
    `# Lunar Landing Site Navigator export: ${label} (${lat}, ${lon}E)`,
    `# Ephemeris: ${series.sources.join('+')}, terrain: ${horizon.info ? horizon.info.mode || 'full' : 'flat'}${horizon.extra ? ` + ${horizon.extra} deg margin` : ''}`,
    'time_utc,sun_az_deg,sun_el_deg,horizon_at_sun_deg,sun_visible,earth_az_deg,earth_el_deg,horizon_at_earth_deg,earth_visible,solar_power_w' +
      (relay ? `,relay_${relay.id}_az_deg,relay_el_deg,relay_link` : ''),
  ]
  for (let k = 0; k < series.t.length; k++) {
    rows.push([
      new Date(series.t[k]).toISOString(),
      series.sunAz[k].toFixed(3), series.sunEl[k].toFixed(4), horizonAt(horizon, series.sunAz[k]).toFixed(3), clr.sun[k] > 0 ? 1 : 0,
      series.earthAz[k].toFixed(3), series.earthEl[k].toFixed(4), horizonAt(horizon, series.earthAz[k]).toFixed(3), clr.earth[k] > 0 ? 1 : 0,
      power ? power[k].toFixed(1) : '',
      ...(relay ? [relay.az[k].toFixed(3), relay.el[k].toFixed(3), relayClr[k] > 0 ? 1 : 0] : []),
    ].join(','))
  }
  downloadText(`lunar-${slug(label)}-${new Date(series.t[0]).toISOString().slice(0, 10)}.csv`, rows.join('\n'))
}

/** Opens the browser print dialog with the print stylesheet (Save as PDF for a report). */
export function printReport() {
  window.print()
}
