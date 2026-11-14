import { useEffect, useRef, useState } from 'react'

// URL of the Cloudflare Worker proxy (worker/). Set at build time: VITE_AI_ENDPOINT.
// The OpenAI key never reaches the browser; without an endpoint the assistant is hidden.
const ENDPOINT = import.meta.env.VITE_AI_ENDPOINT

const SUGGESTIONS = [
  'Why is the Sun so low at the south pole?',
  'Is this a good place and date to land?',
  'Why can\'t Chang\'e 4 see Earth?',
  'Что такое либрация?',
]

/** Floating "ask the assistant" bubble (bottom-right). `context` = live data about the current view. */
export function Assistant({ context }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { listRef.current?.scrollTo(0, listRef.current.scrollHeight) }, [msgs, busy])
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  if (!ENDPOINT) return null

  const send = async (text) => {
    const q = text.trim()
    if (!q || busy) return
    const next = [...msgs, { role: 'user', content: q }]
    setMsgs(next)
    setInput('')
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`${ENDPOINT.replace(/\/$/, '')}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-12), context }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`)
      setMsgs([...next, { role: 'assistant', content: d.reply }])
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? 'No connection to the assistant.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className={`ai-fab ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close assistant' : 'Ask the assistant'}>
        {open ? '×' : 'AI'}
      </button>
      {open && (
        <div className="ai-panel" role="dialog" aria-label="Moon assistant">
          <div className="ai-head">
            <b>Luna</b>
            <span>assistant · knows this view</span>
            {msgs.length > 0 && <button className="ai-clear" onClick={() => { setMsgs([]); setError(null) }}>new chat</button>}
          </div>
          <div className="ai-list" ref={listRef}>
            {msgs.length === 0 && (
              <div className="ai-empty">
                <p>Ask anything about the Moon, this landing site, or how to use the app. Any language works.</p>
                {SUGGESTIONS.map((s) => <button key={s} className="ai-sug" onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
            {msgs.map((m, i) => <div key={i} className={`ai-msg ${m.role}`}>{m.content}</div>)}
            {busy && <div className="ai-msg assistant typing"><span /><span /><span /></div>}
            {error && <div className="ai-error">{error}</div>}
          </div>
          <form className="ai-form" onSubmit={(e) => { e.preventDefault(); send(input) }}>
            <textarea ref={inputRef} rows={1} value={input} placeholder="Ask a question…" maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }} />
            <button type="submit" className="primary" disabled={busy || !input.trim()}>Send</button>
          </form>
        </div>
      )}
    </>
  )
}
