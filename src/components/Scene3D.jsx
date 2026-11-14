import { useEffect, useRef, useState } from 'react'
import { getDem } from '../lib/quickTerrain.js'
import { Explain } from '../lib/learn.jsx'

const R = 1737400
const RAD = Math.PI / 180

// Size of the 3D patch around the site and grid resolution.
function patchFor(lat) {
  if (lat <= -80) return { half: 6000, n: 161 } // 80 m LOLA near the pole
  if (lat <= -75) return { half: 15000, n: 121 } // 240 m
  return { half: 60000, n: 81 } // 3.8 km global tiles: coarse
}

// Direction in the scene (x = east, y = up, z = south) from azimuth/elevation.
const dirOf = (az, el) => [Math.sin(az * RAD) * Math.cos(el * RAD), Math.sin(el * RAD), -Math.cos(az * RAD) * Math.cos(el * RAD)]

function applyHeights(c, exag) {
  const pos = c.geo.attributes.position
  for (let k = 0; k < c.n * c.n; k++) pos.setY(k, c.hs[k] * c.S * exag)
  pos.needsUpdate = true
  c.geo.computeVertexNormals()
}

function placeBodies(c, { sun, earth }) {
  const s = dirOf(sun.az, sun.el), e = dirOf(earth.az, earth.el)
  const d = c.half * c.S * 3
  c.sunLight.position.set(s[0] * d, s[1] * d, s[2] * d)
  c.sunLight.intensity = sun.el > -0.27 ? 3.2 : 0
  c.sunSprite.position.set(s[0] * c.SKY, s[1] * c.SKY, s[2] * c.SKY)
  c.earthBall.position.set(e[0] * c.SKY, e[1] * c.SKY, e[2] * c.SKY)
}

/** Interactive 3D terrain around the site, lit by the real Sun, with Earth in the sky. */
export function Scene3D({ lat, lon, sun, earth }) {
  const mount = useRef(null)
  const ctx = useRef(null)
  const exagRef = useRef(2)
  const bodiesRef = useRef({ sun, earth })
  const [status, setStatus] = useState('Loading terrain…')
  const [exag, setExag] = useState(2)
  const patch = patchFor(lat)

  // Build the scene for this site.
  useEffect(() => {
    let disposed = false
    let raf = 0
    const el = mount.current
    setStatus('Loading terrain…')
    ;(async () => {
      const [THREE, { OrbitControls }, dem] = await Promise.all([
        import('three'),
        import('three/examples/jsm/controls/OrbitControls.js'),
        getDem(),
      ])
      await dem.prepareArea(lat, lon, patch.half)
      if (disposed) return
      const { half, n } = patch
      // Height grid in metres relative to the site, row 0 = north edge.
      const hs = new Float32Array(n * n)
      const h0 = dem.sample(lat, lon, 0)?.h ?? 0
      let lo = Infinity, hi = -Infinity
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const dn = half - (2 * half * i) / (n - 1), de = -half + (2 * half * j) / (n - 1)
          const la = lat + dn / R / RAD, loN = lon + de / (R * Math.cos(lat * RAD)) / RAD
          const v = (dem.sample(la, loN, 0)?.h ?? h0) - h0
          hs[i * n + j] = v
          lo = Math.min(lo, v)
          hi = Math.max(hi, v)
        }

      const renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      el.innerHTML = ''
      el.append(renderer.domElement)
      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#02030a')
      const S = 1 / 1000 // scene units = km
      const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 5000)
      camera.position.set(-half * 0.9 * S, half * 0.7 * S, half * 1.1 * S)
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.target.set(0, 0, 0)
      controls.maxPolarAngle = Math.PI * 0.49
      controls.enableDamping = true

      const geo = new THREE.PlaneGeometry(2 * half * S, 2 * half * S, n - 1, n - 1)
      geo.rotateX(-Math.PI / 2)
      const colors = new Float32Array(n * n * 3)
      for (let k = 0; k < n * n; k++) {
        const t = (hs[k] - lo) / Math.max(1, hi - lo)
        const c = 0.42 + 0.35 * t
        colors.set([c, c * 0.97, c * 0.92], k * 3)
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: false })
      const terrain = new THREE.Mesh(geo, mat)
      terrain.receiveShadow = true
      terrain.castShadow = true
      scene.add(terrain)

      // Lander marker at the site.
      const lander = new THREE.Group()
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.12, 12), new THREE.MeshStandardMaterial({ color: '#d8d8d8', metalness: 0.6, roughness: 0.4 }))
      body.position.y = 0.06
      const pin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 12), new THREE.MeshBasicMaterial({ color: '#ffc93c' }))
      pin.rotation.x = Math.PI
      pin.position.y = 0.6
      lander.add(body, pin)
      body.castShadow = true
      scene.add(lander)

      const sunLight = new THREE.DirectionalLight('#fff7e8', 3.2)
      sunLight.castShadow = true
      sunLight.shadow.mapSize.set(4096, 4096)
      const sc = sunLight.shadow.camera
      sc.left = -half * S * 1.5; sc.right = half * S * 1.5; sc.top = half * S * 1.5; sc.bottom = -half * S * 1.5
      sc.near = 0.1; sc.far = half * S * 8
      sunLight.shadow.normalBias = 0.02
      scene.add(sunLight, sunLight.target)
      const ambient = new THREE.AmbientLight('#8fa6ff', 0.35) // stylised earthshine so night-time terrain stays readable
      scene.add(ambient)

      const SKY = half * S * 6
      const sunSprite = new THREE.Mesh(new THREE.SphereGeometry(SKY * Math.tan(0.267 * RAD) * 1.6, 24, 12), new THREE.MeshBasicMaterial({ color: '#fff4c8' }))
      const earthBall = new THREE.Mesh(new THREE.SphereGeometry(SKY * Math.tan(0.95 * RAD), 32, 16), new THREE.MeshBasicMaterial({ color: '#4ea8ff' }))
      scene.add(sunSprite, earthBall)

      const starPos = new Float32Array(1500 * 3)
      for (let k = 0; k < 1500; k++) {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = SKY * 1.2
        starPos.set([r * Math.sqrt(1 - u * u) * Math.cos(th), r * Math.abs(u), r * Math.sqrt(1 - u * u) * Math.sin(th)], k * 3)
      }
      const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3)), new THREE.PointsMaterial({ color: '#ffffff', size: 1.2, sizeAttenuation: false }))
      scene.add(stars)

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
        renderer.render(scene, camera)
      }
      loop()
      ctx.current = { THREE, renderer, scene, geo, hs, n, terrain, lander, sunLight, ambient, sunSprite, earthBall, SKY, S, half, ro, controls }
      applyHeights(ctx.current, exagRef.current)
      placeBodies(ctx.current, bodiesRef.current)
      setStatus(null)
    })().catch((e) => !disposed && setStatus(`3D view failed: ${e.message}`))

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      const c = ctx.current
      if (c) {
        c.ro.disconnect()
        c.controls.dispose()
        c.renderer.dispose()
        c.geo.dispose()
        ctx.current = null
      }
    }
  }, [lat, lon])

  // Vertical exaggeration and Sun/Earth positions (also applied once when the scene is built).
  exagRef.current = exag
  bodiesRef.current = { sun, earth }
  useEffect(() => { if (ctx.current) applyHeights(ctx.current, exag) }, [exag])
  useEffect(() => { if (ctx.current) placeBodies(ctx.current, { sun, earth }) }, [sun.az, sun.el, earth.az, earth.el])

  return (
    <div className="panel" id="scene-panel">
      <div className="panel-head">
        <h2>3D view</h2>
        <p>
          {(2 * patch.half / 1000).toFixed(0)}×{(2 * patch.half / 1000).toFixed(0)} km of LOLA terrain around the site (pin), lit by the Sun at the selected time
          {lat > -75 ? ' (coarse 3.8 km data outside the south polar region, so local relief looks flat)' : ''}.
          Drag to rotate, scroll to zoom. Shadows only come from terrain inside this patch; the panorama above uses 300 km.
        </p>
        <label className="exag">Height ×{exag}
          <input type="range" min="1" max="5" step="0.5" value={exag} onChange={(e) => setExag(Number(e.target.value))} />
        </label>
      </div>
      <div className="scene" ref={mount} />
      {status && <div className="scene-status">{status}</div>}
      <Explain title="What am I looking at?" links={[{ id: 'sky-panel', label: 'Sky view' }, { id: 'timeline-panel', label: 'Timeline (moves the Sun)' }]}>
        <p>Real Moon terrain around the landing site (yellow pin), from NASA laser measurements. The light comes from where the Sun really is at the chosen time; the blue ball is Earth. Press Play in the timeline and watch the shadows swing around. Near the pole they are kilometres long because the Sun is so low.</p>
      </Explain>
    </div>
  )
}
