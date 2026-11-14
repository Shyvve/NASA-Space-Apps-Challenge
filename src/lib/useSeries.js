import { useEffect, useMemo, useState } from 'react'
import { computeSeries, horizonsCovers, loadHorizons, makeSampler } from './scenario.js'

/** Loads the Horizons table for a curated site (null for custom coordinates). */
export function useHorizons(siteId) {
  const [state, setState] = useState({ id: null, data: null })
  useEffect(() => {
    let alive = true
    if (!siteId || siteId === 'custom') {
      setState({ id: siteId, data: null })
      return
    }
    loadHorizons(siteId).then((data) => alive && setState({ id: siteId, data }))
    return () => {
      alive = false
    }
  }, [siteId])
  // While a new site is loading, fall back to the engine instead of using the previous site's table.
  return state.id === siteId ? state.data : null
}

/** Sun/Earth series for a site starting at `start`. Uses Horizons when it covers the whole window. */
export function useSeries(siteId, lat, lon, start, days, stepMin) {
  const horizons = useHorizons(siteId)
  return useMemo(() => {
    const table = horizonsCovers(horizons, start, days) ? horizons : null
    return computeSeries(makeSampler(lat, lon, table), start, days, stepMin)
  }, [horizons, lat, lon, start.getTime(), days, stepMin])
}
