import { useEffect, useLayoutEffect, useState } from 'react'

export const TOUR_STEPS = [
  { id: 'status-cards', title: 'Is the lander OK right now?', text: 'These cards answer two questions: is the Sun up (power for solar panels) and is the Earth up (radio link home)? Green means both. The countdowns say how long until that changes.' },
  { id: 'map-panel', title: 'Choose where to land', text: 'Click anywhere on the Moon. The white dots are real missions: Apollo, Chang\'e, Chandrayaan-3, and the south pole spots NASA is studying for Artemis astronauts.' },
  { id: 'sky-panel', title: 'Look around from the lander', text: 'This is the whole horizon, all 360°. The grey shape is the real mountains around the site, measured by NASA\'s LOLA laser. The Sun and Earth are only useful while they are above it.' },
  { id: 'timeline-panel', title: 'Watch time pass', text: 'One day on the Moon lasts about a month. Press Play to see the Sun and Earth move. The bars at the bottom show when each is visible.' },
  { id: 'scene-panel', title: 'See it in 3D', text: 'The same place as a 3D model. Drag to look around. Shadows come from the real Sun position. Near the pole the Sun skims the horizon, so shadows are kilometres long.' },
  { id: 'planner-panel', title: 'Pick a good day', text: 'Each column is a possible landing day. Bright = lots of sunlight / Earth contact in the two weeks after landing. A delay of a few days can change everything.' },
  { id: 'illum-panel', title: 'Move a little, gain a lot', text: 'Near the poles, moving just a few hundred metres onto a ridge can give much more sunlight. Scan to find the best spot nearby.' },
  { id: 'relay-panel', title: 'No Earth in the sky? Use a satellite', text: 'From the far side, or behind south pole mountains, Earth is hidden. Pick a relay satellite to see when the lander can still send messages home through it.' },
  { id: 'power-panel', title: 'Will we have enough electricity?', text: 'Turn sunlight into watts. Change the panel size and the lander\'s power use to see how big a battery you need to survive the night.' },
  { id: 'compare-panel', title: 'Compare plans', text: 'Pin different sites and dates and compare them side by side, like engineers do when a launch slips.' },
]

/** Step-by-step spotlight tour. */
export function Tour({ open, onClose }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState(null)
  const s = TOUR_STEPS[step]

  useEffect(() => { if (open) setStep(0) }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const el = document.getElementById(s.id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const update = () => setRect(el.getBoundingClientRect())
    update()
    const id = setInterval(update, 100)
    window.addEventListener('resize', update)
    return () => { clearInterval(id); window.removeEventListener('resize', update) }
  }, [open, step, s.id])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setStep((x) => Math.min(TOUR_STEPS.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setStep((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !rect) return null
  const pad = 8
  const vh = window.innerHeight, vw = window.innerWidth
  // Below the spotlight if it fits, else above; big panels get the box pinned to the bottom-right corner.
  let pos
  if (rect.bottom + 12 + 200 < vh) pos = { top: rect.bottom + 12, left: Math.min(Math.max(12, rect.left), vw - 392) }
  else if (rect.top - 12 - 200 > 0) pos = { top: rect.top - 12 - 200, left: Math.min(Math.max(12, rect.left), vw - 392) }
  else pos = { bottom: 16, right: 16 }
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div className="tour-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad }} />
      <div className="tour-box" style={pos}>
        <div className="tour-step muted small">Step {step + 1} of {TOUR_STEPS.length}</div>
        <h3>{s.title}</h3>
        <p>{s.text}</p>
        <div className="tour-nav">
          <button onClick={onClose}>Close</button>
          <span />
          <button disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step < TOUR_STEPS.length - 1
            ? <button className="primary" onClick={() => setStep(step + 1)}>Next</button>
            : <button className="primary" onClick={onClose}>Done</button>}
        </div>
      </div>
    </div>
  )
}
