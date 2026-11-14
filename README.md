# Lunar Landing Site Navigator

NASA Space Apps Challenge 2026: [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).

A web app for picking a landing site and date on the Moon and checking two things right away:
**will the Sun be up for power**, and **will Earth be up for a direct link**. It also shows how long each will last.

## Features

- **18 curated sites**: Apollo 11–17, Chang'e 3/4/6, Chandrayaan-3, SLIM, IM-1, IM-2, Blue Ghost M1, the south pole (Shackleton rim, Connecting Ridge) and Artemis III regions (Malapert, Nobile). You can also enter any coordinates.
- **Status card**: power + comms / power only / comms only / nothing.
- **Solar and Earth elevation**, plus a countdown to the next sunset/sunrise and Earthset/Earthrise.
- **14-day outlook**: % of time with sunlight, with Earth in view, and with both, plus the longest night.
- **360° sky panorama**: Sun and Earth paths around the horizon over 30 days.
- **Mission timeline**: elevation over 30 days with visibility bands. Drag it or hit Play.
- **Landing date planner**: a heatmap of every landing day over 4 months. Click a day to load it. It shows how a one-week slip changes everything.
- **Scenario comparison**: pin site + date combinations and compare them side by side.
- **Real terrain horizon** from LOLA: the panorama shows the actual skyline, and the Sun/Earth count as up only when they clear it. A slider adds an extra safety margin.
- **"Why the Moon is different"**: no atmosphere/refraction, 29.5-day day, libration, Earth's size in the sky.

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
Results are in `public/terrain/`.

Sanity checks:
- IM-2 Athena surface height comes out at 5321 m. The NAIF SPICE site kernel gives about 5.3 km.
- Connecting Ridge (Gläser et al. 2014 point): 86% sunlit over 2027. Gläser reports ~89–92% for a 10 m mast; this model uses 2 m.
- Equatorial sites ~47–49% sunlit, far-side sites (Chang'e 4/6) never see Earth.

Coordinates: flown missions use published landing points (LROC, NAIF for IM-2). NASA publishes Artemis III regions as ~15×15 km
areas without center points, so Shackleton rim, Malapert and Nobile are the best-lit LOLA points near those features
(`scripts/scan-illumination.mjs`).

### Terrain for custom coordinates: two modes

| Mode | Where it runs | Data | Accuracy vs full resolution |
| --- | --- | --- | --- |
| **1 · Quick** | In the browser, automatic | Only the LOLA tiles around the point (`public/dem/`): 80 m / 240 m near the south pole, 480 m → 1.9 km farther out, 3.8 km elsewhere. Typically 0.3–3 MB | RMS 0.02–0.04° within ~85 km of the pole, up to ~1° elsewhere (`node scripts/validate-quick.mjs`) |
| **2 · Precise** | Offline kit on your computer (`public/kit/lunar-horizon-kit.mjs`, Node 18+, no install) | Downloads full LOLA DEMs from NASA PDS once (33–180 MB) | Identical to the curated-site profiles |

Precise mode: download the kit from the Terrain panel, run `node lunar-horizon-kit.mjs <lat> <lon> --out horizon.json`,
then import `horizon.json` on the site. The kit is generated from the same `src/lib/horizonCore.js` as the browser (`npm run kit`).

**Limitations:** relief smaller than the DEM pixel (boulders, small craters) is not modelled; use the margin slider for that.

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
npm run terrain         # recompute horizon profiles (needs the DEMs in data-raw/)
npm run tiles           # rebuild browser terrain tiles (needs the DEMs in data-raw/)
npm run kit             # rebuild the offline kit from src/lib/horizonCore.js
```

To recompute terrain, download `ldem_80s_80m.img`, `ldem_75s_240m.img` (polar/img) and `ldem_16.img` (cylindrical/img) from the
[LOLA GDR archive](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/) into `data-raw/`.
