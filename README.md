# Lunar Landing Site Navigator

NASA Space Apps Challenge 2026: [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).

**Live site: https://shyvve.github.io/NASA-Space-Apps-Challenge/**

A web app for picking a landing site and date on the Moon and checking two things right away:
**will the Sun be up for power**, and **will Earth be up for a direct link**. It also shows how long each will last.

## Run it on your computer

The downloaded version works like the website, plus **one-click precise terrain** for any point on the Moon.

1. Install [Node.js](https://nodejs.org/) (version 18 or newer, the "LTS" button).
2. Get the code: on this GitHub page press the green **Code** button → **Download ZIP**, then unzip it.
   Or, with git: `git clone https://github.com/Shyvve/NASA-Space-Apps-Challenge.git`
3. Open a terminal in the unzipped folder and run:

   ```bash
   npm install
   npm start
   ```

   The app builds and opens in your browser. For development use `npm run dev` instead and open http://localhost:5173.

4. Choose **Custom coordinates** (or click the map) and press **Make it precise** in the Terrain panel.
   The first time it downloads NASA's full-resolution LOLA maps (33–180 MB, depending on the place) into `data-raw/`, then every point takes about a second.

## Features

- **Clickable Moon map** (south pole and whole Moon, shaded LOLA relief): click to land anywhere; markers for all curated sites.
- **18 curated sites**: Apollo 11–17, Chang'e 3/4/6, Chandrayaan-3, SLIM, IM-1, IM-2, Blue Ghost M1, the south pole (Shackleton rim, Connecting Ridge) and Artemis III regions (Malapert, Nobile).
- **Status cards**: power + comms / power only / comms only / nothing, with countdowns to sunset/sunrise and Earthset/Earthrise.
- **360° sky panorama** with the real LOLA skyline, and Sun/Earth paths over 30 days.
- **Mission timeline**: elevation over 30 days with visibility bands. Drag it or hit Play.
- **3D view**: LOLA terrain around the site, lit by the Sun at the selected time, Earth in the sky (three.js).
- **Relay satellites**: when Earth is hidden (far side, or behind south pole mountains), pick a relay: NRHO (Gateway-style), elliptical frozen orbit (LCRNS-style) or Earth–Moon L2 halo (Queqiao-style). The app shows direct vs relay vs total link time, the longest silence, and relay passes on the timeline and panorama. Orbits are simplified Kepler / halo models with an arbitrary phase.
- **Solar power & battery**: panel area, efficiency and mounting → watts over time and the battery needed to survive the night.
- **Landing date planner**: a heatmap of every landing day over 4 months. Shows how a one-week slip changes everything.
- **Light around the site**: sunlight / Earth visibility over a year on a 9×9 grid around the site, each cell with its own horizon. "Move 300 m north and gain 20%".
- **Scenario comparison**: pin site + date combinations and compare them side by side; export to CSV.
- **Share link**: the URL holds the site, date, time and settings, so a teammate sees the exact same view.
- **Export**: CSV of the whole time series, and Print / PDF report.
- **Expert / Learn mode**: Learn mode uses simpler words, explains every panel and how panels connect, and has a guided tour.

## Data and accuracy

| Source | Used for |
| --- | --- |
| [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) (DE441, airless apparent topocentric Az/El) | Curated sites, Nov 2026 to Dec 2027, 2-hour steps, pre-downloaded into `public/horizons/` |
| In-browser model: [astronomy-engine](https://github.com/cosinekitty/astronomy) + IAU lunar rotation model (with libration) + topocentric parallax | Custom coordinates and dates outside the Horizons range |

`npm run validate` compares the two. Across all curated sites: **max error 0.004°, RMS 0.001°** in elevation.

No atmosphere means no refraction: the horizon is geometric. A body counts as "up" while its upper limb is above the horizon
(Sun radius 0.267°, Earth radius 0.95° as seen from the Moon).

### Terrain

Horizon profiles (horizon elevation every 0.5° of azimuth) are ray-traced through LOLA gridded DEMs from the
[PDS Geosciences Node](https://pds-geosciences.wustl.edu/missions/lro/lola.htm) out to 300 km, on a sphere, for an observer 2 m above the ground:
80 m/px (`ldem_80s_80m`) and 240 m/px (`ldem_75s_240m`) south polar stereographic, and 16 px/deg global (`ldem_16`) elsewhere.
Curated sites are precomputed in `public/terrain/`.

Sanity checks:
- IM-2 Athena surface height comes out at 5321 m. The NAIF SPICE site kernel gives about 5.3 km.
- Connecting Ridge (Gläser et al. 2014 point): 86% sunlit over 2027. Gläser reports ~89–92% for a 10 m mast; this model uses 2 m.
- Equatorial sites ~47–49% sunlit, far-side sites (Chang'e 4/6) never see Earth.

Coordinates: flown missions use published landing points (LROC, NAIF for IM-2). NASA publishes Artemis III regions as ~15×15 km
areas without center points, so Shackleton rim, Malapert and Nobile are the best-lit LOLA points near those features
(`scripts/scan-illumination.mjs`).

### Terrain for custom coordinates

| Mode | Where | Data | Accuracy vs full resolution |
| --- | --- | --- | --- |
| **Quick** | Website and downloaded app, automatic | Only the LOLA tiles around the point (`public/dem/`): 80 m / 240 m near the south pole, 480 m → 1.9 km farther out, 3.8 km elsewhere. Typically 0.3–3 MB | RMS 0.02–0.04° within ~85 km of the pole, up to ~1° elsewhere (`node scripts/validate-quick.mjs`) |
| **Precise** | Downloaded app (local server, `scripts/precise-server.mjs`), one click | Full LOLA DEMs from NASA PDS, downloaded once | Identical to the curated-site profiles |

Precise mode cannot run on the public website: NASA's PDS server does not allow browsers on other sites to read its files (no CORS),
so the local app downloads them on your computer instead.

**Limitations:** relief smaller than the DEM pixel (boulders, small craters) is not modelled; use the margin slider for that.
The 3D view and the light grid use quick-mode tiles.

## Scripts

```bash
npm run dev             # development server
npm start               # build and open the production version (with precise mode)
npm run build           # production build into dist/
npm run fetch-horizons  # re-download Horizons tables
npm run validate        # compare in-browser model vs Horizons
npm run terrain         # recompute curated horizon profiles (needs the DEMs in data-raw/)
npm run tiles           # rebuild browser terrain tiles (needs the DEMs in data-raw/)
npm run maps            # re-render the map images (needs the DEMs in data-raw/)
```

To rebuild data, download `ldem_80s_80m.img`, `ldem_75s_240m.img` (polar/img) and `ldem_16.img` (cylindrical/img) from the
[LOLA GDR archive](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/) into `data-raw/`
(or press "Make it precise" once in the local app, which downloads them).
