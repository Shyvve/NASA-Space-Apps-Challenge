// "Learn" mode: simpler words, an explanation under every panel, and how the panels connect.
import { createContext, useContext } from 'react'

export const LearnContext = createContext(false)
export const useLearn = () => useContext(LearnContext)

/** Picks the expert or the simple wording. */
export function useWords() {
  const learn = useLearn()
  return (expert, simple) => (learn ? simple : expert)
}

/** Explanation box, shown only in Learn mode. `links` = [{ id, label }] of related panels. */
export function Explain({ title = 'What is this?', children, links }) {
  const learn = useLearn()
  if (!learn) return null
  return (
    <div className="explain">
      <div className="explain-title">💡 {title}</div>
      <div className="explain-body">{children}</div>
      {links?.length > 0 && (
        <div className="explain-links">
          Connected to:{' '}
          {links.map((l, i) => (
            <span key={l.id}>
              {i > 0 && ' · '}
              <a href={`#${l.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(l.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{l.label}</a>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
