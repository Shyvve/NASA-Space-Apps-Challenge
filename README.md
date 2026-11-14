# Lunar Landing Site Navigator

NASA Space Apps Challenge 2026: [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).

A web app for picking a landing site and date on the Moon and checking two things right away:
**will the Sun be up for power**, and **will Earth be up for a direct link**. It also shows how long each will last.

## Features

- **19 curated sites**: Apollo 11–17, Chang'e 3/4/6, Chandrayaan-3, SLIM, IM-1, IM-2, Blue Ghost M1, and south pole candidate regions (Shackleton rim, Connecting Ridge, Malapert, Haworth, Nobile). You can also enter any coordinates.
- **Status card**: power + comms / power only / comms only / nothing.
- **Solar and Earth elevation**, plus a countdown to the next sunset/sunrise and Earthset/Earthrise.
- **14-day outlook**: % of time with sunlight, with Earth in view, and with both, plus the longest night.
- **360° sky panorama**: Sun and Earth paths around the horizon over 30 days.
- **Mission timeline**: elevation over 30 days with visibility bands. Drag it or hit Play.
- **Landing date planner**: a heatmap of every landing day over 4 months. Click a day to load it. It shows how a one-week slip changes everything.
- **Scenario comparison**: pin site + date combinations and compare them side by side.
- **Terrain horizon slider**: raise the local horizon to model ridges and crater walls.
- **"Why the Moon is different"**: no atmosphere/refraction, 29.5-day day, libration, Earth's size in the sky.

## Data and accuracy

| Source | Used for |
| --- | --- |
| [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) (DE441, airless apparent topocentric Az/El) | Curated sites, Nov 2026 to Dec 2027, 2-hour steps, pre-downloaded into `public/horizons/` |
| In-browser model: [astronomy-engine](https://github.com/cosinekitty/astronomy) + IAU lunar rotation model (with libration) + topocentric parallax | Custom coordinates and dates outside the Horizons range |

`npm run validate` compares the two. Across all 19 sites: **max error 0.004°, RMS 0.001°** in elevation.

No atmosphere means no refraction: the horizon is geometric. A body counts as "up" while its upper limb is above the horizon
(Sun radius 0.267°, Earth radius 0.95° as seen from the Moon).

**Limitations:** terrain is modelled as a uniform horizon mask. Per-azimuth horizon profiles from LOLA DEMs are the next step.
Coordinates of the south pole candidate regions are approximate.

## Run

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build           # production build into dist/
npm run fetch-horizons  # re-download Horizons tables
npm run validate        # compare in-browser model vs Horizons
```
