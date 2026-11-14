import { useEffect, useRef, useState } from 'react'
import { SITES } from '../data/sites.js'
import { Hint } from '../lib/learn.jsx'

const R = 1737.4 // km
const POLE_EXTENT_KM = 320 // must match scripts/build-maps.mjs
const RAD = Math.PI / 180
const BASE = import.meta.env.BASE_URL

// ---- Flat projections (lat/lon <-> fraction of the image) ----
function poleToXY(lat, lon) {
  const k = 2 * R * Math.tan(Math.PI / 4 + (lat * RAD) / 2)
  return [0.5 + (k * Math.sin(lon * RAD)) / (2 * POLE_EXTENT_KM), 0.5 - (k * Math.cos(lon * RAD)) / (2 * POLE_EXTENT_KM)]
}
function poleFromXY(fx, fy) {
  const x = (fx - 0.5) * 2 * POLE_EXTENT_KM, y = (0.5 - fy) * 2 * POLE_EXTENT_KM
  return [(2 * (Math.atan(Math.hypot(x, y) / (2 * R)) - Math.PI / 4)) / RAD, Math.atan2(x, y) / RAD]
}
const globeToXY = (lat, lon) => [((lon + 540) % 360) / 360, (90 - lat) / 180]
const globeFromXY = (fx, fy) => [90 - fy * 180, fx * 360 - 180]

const FLAT = {
  flat: { img: 'maps/moon.png', ratio: 2, to: globeToXY, from: globeFromXY },
  pole: { img: 'maps/south-pole.png', ratio: 1, to: poleToXY, from: poleFromXY },
}
const inFlat = (v, lat, lon) => {
  const [x, y] = FLAT[v].to(lat, lon)
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 && (v === 'flat' || lat < -70)
}

// ---- Globe: lat/lon <-> 3D point on a unit sphere textured with an equirectangular map ----
const toVec = (lat, lon, r = 1) => [r * Math.cos(lat * RAD) * Math.cos(lon * RAD), r * Math.sin(lat * RAD), -r * Math.cos(lat * RAD) * Math.sin(lon * RAD)]
const fromVec = (p) => [Math.asin(Math.max(-1, Math.min(1, p.y))) / RAD, Math.atan2(-p.z, p.x) / RAD]
const round4 = (v) => Math.round(v * 10000) / 10000

function nearestSite(lat, lon, maxDeg) {
  let best = null, bd = maxDeg
  for (const s of SITES) {
    const d = Math.acos(Math.min(1, Math.sin(lat * RAD) * Math.sin(s.lat * RAD) + Math.cos(lat * RAD) * Math.cos(s.lat * RAD) * Math.cos((lon - s.lon) * RAD))) / RAD
    if (d < bd) { bd = d; best = s }
  }
  return best
}

function Globe({ lat, lon, siteId, onPick, onSite, onHover }) {
  const mount = useRef(null)
  const ctx = useRef(null)
  const [ready, setReady] = useState(false)
  const pickRef = useRef({ onPick, onSite, onHover })
  pickRef.current = { onPick, onSite, onHover }

  useEffect(() => {
    let disposed = false, raf = 0
    const el = mount.current
    ;(async () => {
      const [THREE, { OrbitControls }] = await Promise.all([import('three'), import('three/examples/jsm/controls/OrbitControls.js')])
      if (disposed) return
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
      el.append(renderer.domElement)
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100)
      camera.position.set(3.4, 0, 0)
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enablePan = false
      controls.minDistance = 1.15
      controls.maxDistance = 6
      controls.rotateSpeed = 0.5
      controls.zoomSpeed = 0.8
      controls.enableDamping = true

      const tex = await new THREE.TextureLoader().loadAsync(`${BASE}maps/moon.png`)
      if (disposed) return
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
      const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }))
      scene.add(moon)
      scene.add(new THREE.AmbientLight('#ffffff', 0.55))
      const key = new THREE.DirectionalLight('#ffffff', 1.6)
      scene.add(key)

      const markers = new THREE.Group()
      for (const s of SITES) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }))
        m.position.set(...toVec(s.lat, s.lon, 1.003))
        m.userData.id = s.id
        markers.add(m)
      }
      scene.add(markers)
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 12), new THREE.MeshBasicMaterial({ color: '#f5c542' }))
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.024, 0.032, 32), new THREE.MeshBasicMaterial({ color: '#f5c542', side: THREE.DoubleSide }))
      scene.add(pin, ring)

      const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
      const hit = (e) => {
        const b = renderer.domElement.getBoundingClientRect()
        ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1)
        ray.setFromCamera(ndc, camera)
        return ray.intersectObject(moon)[0]?.point
      }
      let down = null
      renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY] })
      renderer.domElement.addEventListener('pointerup', (e) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return
        const p = hit(e)
        if (!p) return
        const [la, lo] = fromVec(p)
        const s = nearestSite(la, lo, 0.6 * camera.position.length())
        if (s) pickRef.current.onSite(s.id)
        else pickRef.current.onPick(round4(la), round4(lo))
      })
      renderer.domElement.addEventListener('pointermove', (e) => {
        const p = hit(e)
        if (!p) return pickRef.current.onHover(null)
        const [la, lo] = fromVec(p)
        const s = nearestSite(la, lo, 0.6 * camera.position.length())
        pickRef.current.onHover({ lat: la, lon: lo, site: s })
      })
      renderer.domElement.addEventListener('pointerleave', () => pickRef.current.onHover(null))

      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight
        renderer.setSize(w, h, false)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      }
      const ro = new ResizeObserver(resize)
      ro.observe(el)
      resize()
      const loop = () => {
        raf = requestAnimationFrame(loop)
        controls.update()
        key.position.copy(camera.position).add(new THREE.Vector3(1, 1.5, 0.5))
        renderer.render(scene, camera)
      }
      loop()
      ctx.current = { THREE, camera, controls, pin, ring, markers, renderer, ro }
      setReady(true)
    })()
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      if (ctx.current) {
        ctx.current.ro.disconnect()
        ctx.current.controls.dispose()
        ctx.current.renderer.dispose()
        ctx.current = null
      }
      el.innerHTML = ''
    }
  }, [])

  // Move the pin; turn the globe to the site when it changes.
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    const p = toVec(lat, lon, 1.004)
    c.pin.position.set(...p)
    c.ring.position.set(...toVec(lat, lon, 1.005))
    c.ring.lookAt(0, 0, 0)
    c.markers.children.forEach((m) => m.material.color.set(m.userData.id === siteId ? '#f5c542' : '#ffffff'))
    const d = c.camera.position.length()
    const v = new c.THREE.Vector3(...p).normalize().multiplyScalar(d)
    c.camera.position.copy(v)
    c.controls.update()
  }, [lat, lon, siteId, ready])

  // The canvas host has no React children: three.js owns it, React owns the overlay next to it.
  return (
    <div className="globe">
      <div className="globe-canvas" ref={mount} />
      {!ready && <span className="globe-loading">Loading Moon…</span>}
    </div>
  )
}

/** Zoomable flat map (whole Moon or south pole). Wheel / buttons to zoom, drag to pan, click to land. */
function FlatMap({ view, lat, lon, siteId, onPick, onSite, onHover, zoomCmd }) {
  const V = FLAT[view]
  const box = useRef(null)
  const [z, setZ] = useState({ s: 1, x: 0, y: 0 })
  const drag = useRef(null)
  useEffect(() => setZ({ s: 1, x: 0, y: 0 }), [view])
  useEffect(() => { if (zoomCmd) setZ((v) => clampZ({ ...v, s: zoomCmd.dir > 0 ? v.s * 1.5 : v.s / 1.5 })) }, [zoomCmd])
  const clampZ = (v) => {
    const s = Math.max(1, Math.min(10, v.s))
    const b = box.current?.getBoundingClientRect()
    if (!b) return { s, x: 0, y: 0 }
    const mx = (b.width * (s - 1)) / 2, my = (b.height * (s - 1)) / 2
    return { s, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) }
  }
  const at = (e) => {
    const b = box.current.querySelector('.flat-inner').getBoundingClientRect()
    return V.from((e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height)
  }
  const [cx, cy] = V.to(lat, lon)
  return (
    <div ref={box} className="flatmap"
      onWheel={(e) => {
        e.preventDefault()
        const b = box.current.getBoundingClientRect()
        const f = e.deltaY < 0 ? 1.25 : 0.8
        const px = e.clientX - b.left - b.width / 2, py = e.clientY - b.top - b.height / 2
        setZ((v) => clampZ({ s: v.s * f, x: px - (px - v.x) * f, y: py - (py - v.y) * f }))
      }}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, z, moved: false } }}
      onPointerMove={(e) => {
        const d = drag.current
        if (d && e.buttons) {
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true
          if (d.moved) setZ(clampZ({ ...d.z, x: d.z.x + e.clientX - d.x, y: d.z.y + e.clientY - d.y }))
        }
        const [la, lo] = at(e)
        onHover({ lat: la, lon: lo, site: nearestSite(la, lo, 1.5 / z.s) })
      }}
      onPointerLeave={() => onHover(null)}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        if (d?.moved) return
        const [la, lo] = at(e)
        onPick(round4(la), round4(lo))
      }}>
      <div className="flat-inner" style={{ '--ratio': V.ratio, transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})`, '--inv': 1 / z.s }}>
        <img src={`${BASE}${V.img}`} alt="Shaded relief map of the Moon from LOLA" draggable="false" decoding="async" />
        {SITES.filter((s) => inFlat(view, s.lat, s.lon)).map((s) => {
          const [x, y] = V.to(s.lat, s.lon)
          return (
            <button key={s.id} className={`map-site ${s.id === siteId ? 'on' : ''}`} style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
              title={s.name} onPointerUp={(e) => { e.stopPropagation(); onSite(s.id) }} onPointerDown={(e) => e.stopPropagation()}>
              <span>{s.name}</span>
            </button>
          )
        })}
        {inFlat(view, lat, lon) && <span className="map-pin" style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }} />}
      </div>
    </div>
  )
}

/** Moon site picker: 3D globe, flat map or south-pole map, all zoomable. */
export function MoonMap({ lat, lon, siteId, onPick, onSite }) {
  const [view, setView] = useState(() => (lat < -80 ? 'pole' : 'globe'))
  const [hover, setHover] = useState(null)
  const [zoomCmd, setZoomCmd] = useState(null)
  return (
    <div className="panel moon-panel" id="map-panel">
      <div className="panel-head">
        <h2>Moon</h2>
        <div className="seg">
          {[['globe', 'Globe'], ['flat', 'Flat'], ['pole', 'South pole']].map(([k, l]) => (
            <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
        <Hint title="How do I pick a site?">
          <p>Click anywhere on the Moon to land there. White dots are real missions; click one to load it. Drag to turn the globe or move the map, scroll (or use + / −) to zoom.</p>
          <p>The surface is shaded from NASA's LOLA laser altimeter. The near side (always facing Earth) is in the middle of the flat map; the far side, which never sees Earth, is at the edges. Switch to <b>South pole</b> for the area NASA is targeting with Artemis: craters there hide water ice in permanent shadow.</p>
        </Hint>
      </div>
      <div className="moon-stage">
        {view === 'globe'
          ? <Globe lat={lat} lon={lon} siteId={siteId} onPick={onPick} onSite={onSite} onHover={setHover} />
          : <FlatMap view={view} lat={lat} lon={lon} siteId={siteId} onPick={onPick} onSite={onSite} onHover={setHover} zoomCmd={zoomCmd} />}
        {view !== 'globe' && (
          <div className="zoom-btns">
            <button onClick={() => setZoomCmd({ dir: 1, t: Date.now() })} aria-label="Zoom in">+</button>
            <button onClick={() => setZoomCmd({ dir: -1, t: Date.now() })} aria-label="Zoom out">−</button>
          </div>
        )}
        <span className="map-coords mono">
          {hover ? (hover.site ? `${hover.site.name} · click to load` : `${hover.lat.toFixed(3)}°, ${hover.lon.toFixed(3)}°E · click to land`) : 'drag · scroll to zoom · click to land'}
        </span>
      </div>
    </div>
  )
}
