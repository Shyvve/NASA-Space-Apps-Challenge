// "Learn" mode: simpler words and expandable explanations (closed until clicked). Hidden in Expert mode.
import { createContext, useContext } from 'react'

export const LearnContext = createContext(false)
export const useLearn = () => useContext(LearnContext)

/** Picks the expert or the simple wording. */
export function useWords() {
  const learn = useLearn()
  return (expert, simple) => (learn ? simple : expert)
}

/** Expandable explanation. `links` = [{ id, label }] of related panels (scrolls / switches to them). */
export function Hint({ title = 'What is this?', children, links }) {
  const learn = useLearn()
  if (!learn) return null
  return (
    <details className="hint">
      <summary><span className="hint-q">?</span>{title}</summary>
      <div className="hint-body">
        {children}
        {links?.length > 0 && (
          <div className="hint-links">
            Connected to:{' '}
            {links.map((l, i) => (
              <span key={l.id}>
                {i > 0 && ' · '}
                <a href={`#${l.id}`} onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('reveal-panel', { detail: l.id })) }}>{l.label}</a>
              </span>
            ))}
          </div>
        )}
      </div>
    </details>
  )
}

export const Explain = Hint

/** Short "what is this panel" note, hidden behind a small (i) button in every mode. */
export function Info({ children, label = 'About this panel' }) {
  return (
    <details className="info">
      <summary aria-label={label} title={label}>i</summary>
      <div className="info-body">{children}</div>
    </details>
  )
}
