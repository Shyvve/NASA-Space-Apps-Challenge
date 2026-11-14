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

const terrainCache = new Map()
function loadTerrain(siteId) {
  if (!terrainCache.has(siteId)) {
    terrainCache.set(
      siteId,
      fetch(`${import.meta.env.BASE_URL}terrain/${siteId}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    )
  }
  return terrainCache.get(siteId)
}

/**
 * Local horizon for a site: LOLA terrain profile (curated sites only) plus a uniform extra margin in degrees.
 * Returns { terrain, azStep, extra, info } where info has the DEM metadata (or null for custom coordinates).
 */
export function useHorizon(siteId, extra) {
  const [state, setState] = useState({ id: null, data: null })
  useEffect(() => {
    let alive = true
    if (!siteId || siteId === 'custom') {
      setState({ id: siteId, data: null })
      return
    }
    loadTerrain(siteId).then((data) => alive && setState({ id: siteId, data }))
    return () => {
      alive = false
    }
  }, [siteId])
  const data = state.id === siteId ? state.data : null
  return useMemo(
    () => ({ terrain: data ? data.mask : null, azStep: data ? data.azStep : 1, extra, info: data }),
    [data, extra],
  )
}
