// Curated landing sites. Latitude in degrees (north +), longitude in degrees east (+), -180..180.
// Coordinates of flown missions come from published landing-site reconstructions (LROC).
// South pole: Connecting Ridge is the Gläser et al. (2014) point. Shackleton rim, Malapert and Nobile are the
// best-illuminated LOLA DEM points near the named features (computed with scripts/scan-illumination.mjs); NASA publishes
// Artemis III regions as ~15x15 km areas without official center points.

export const SITES = [
  // Apollo
  { id: 'apollo11', name: 'Apollo 11', group: 'Apollo', lat: 0.6741, lon: 23.4730, note: 'Mare Tranquillitatis, 1969' },
  { id: 'apollo12', name: 'Apollo 12', group: 'Apollo', lat: -3.0124, lon: -23.4216, note: 'Oceanus Procellarum, 1969' },
  { id: 'apollo14', name: 'Apollo 14', group: 'Apollo', lat: -3.6453, lon: -17.4714, note: 'Fra Mauro, 1971' },
  { id: 'apollo15', name: 'Apollo 15', group: 'Apollo', lat: 26.1322, lon: 3.6339, note: 'Hadley–Apennine, 1971' },
  { id: 'apollo16', name: 'Apollo 16', group: 'Apollo', lat: -8.9730, lon: 15.5002, note: 'Descartes Highlands, 1972' },
  { id: 'apollo17', name: 'Apollo 17', group: 'Apollo', lat: 20.1908, lon: 30.7717, note: 'Taurus–Littrow, 1972' },

  // Robotic / commercial / international
  { id: 'change3', name: "Chang'e 3", group: 'Robotic & commercial', lat: 44.1214, lon: -19.5116, note: 'Mare Imbrium, CNSA 2013' },
  { id: 'change4', name: "Chang'e 4", group: 'Robotic & commercial', lat: -45.4446, lon: 177.5991, note: 'Von Kármán crater, far side, CNSA 2019' },
  { id: 'change6', name: "Chang'e 6", group: 'Robotic & commercial', lat: -41.6385, lon: -153.9852, note: 'Apollo basin, far side, CNSA 2024' },
  { id: 'chandrayaan3', name: 'Chandrayaan-3', group: 'Robotic & commercial', lat: -69.373, lon: 32.319, note: 'Shiv Shakti point, ISRO 2023' },
  { id: 'slim', name: 'SLIM', group: 'Robotic & commercial', lat: -13.316, lon: 25.251, note: 'Shioli crater, JAXA 2024' },
  { id: 'im1', name: 'IM-1 Odysseus', group: 'Robotic & commercial', lat: -80.13, lon: 1.44, note: 'Malapert A, Intuitive Machines / CLPS 2024' },
  { id: 'blueghost1', name: 'Blue Ghost M1', group: 'Robotic & commercial', lat: 18.56, lon: 61.81, note: 'Mons Latreille, Mare Crisium, Firefly / CLPS 2025' },
  { id: 'im2', name: 'IM-2 Athena', group: 'Robotic & commercial', lat: -84.7906, lon: 29.1957, note: 'Mons Mouton, Intuitive Machines / CLPS 2025 (NAIF SPICE site)' },

  // South pole
  { id: 'shackleton', name: 'Shackleton rim', group: 'South pole', lat: -89.6965, lon: -161.571, note: 'Best-lit LOLA point within 1.5 km of rim Point A (Bussey et al. 2010)' },
  { id: 'connecting-ridge', name: 'Connecting Ridge', group: 'South pole', lat: -89.45, lon: -137.31, note: 'Shackleton–de Gerlache ridge, most-illuminated point (Gläser et al. 2014)' },
  { id: 'malapert', name: 'Malapert Massif', group: 'Artemis III regions (approx.)', lat: -85.99, lon: 1.987, note: 'Best-lit LOLA point near the massif summit; Artemis III candidate region' },
  { id: 'nobile', name: 'Nobile Rim', group: 'Artemis III regions (approx.)', lat: -85.234, lon: 36.598, note: 'Best-lit LOLA point on Nobile rim; Artemis III candidate region' },
]

export const findSite = (id) => SITES.find((s) => s.id === id)
