// Cloudflare Worker: private proxy between the website and the OpenAI API.
// The API key lives only here, as a Worker secret (OPENAI_API_KEY); it is never sent to the browser.
//
// POST /chat  { messages: [{ role: 'user'|'assistant', content }], context: { ... current view ... } }
//          -> { reply }
import { SYSTEM_PROMPT } from './knowledge.js'

const MAX_MESSAGES = 12
const MAX_CHARS = 2000

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  const ok = allowed.includes(origin)
  return {
    ok,
    headers: {
      'Access-Control-Allow-Origin': ok ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  }
}

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } })

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const { ok, headers } = cors(origin, env)
    if (request.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers })
    const url = new URL(request.url)
    if (request.method !== 'POST' || url.pathname !== '/chat') return json({ error: 'Not found' }, 404, headers)
    // Only our website may use the proxy (browsers always send Origin on cross-site POST).
    if (!ok) return json({ error: 'Origin not allowed' }, 403, headers)

    // Per-visitor rate limit (Cloudflare rate limiting binding, see wrangler.toml).
    if (env.LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const { success } = await env.LIMITER.limit({ key: ip })
      if (!success) return json({ error: 'Too many questions, wait a minute.' }, 429, headers)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Bad JSON' }, 400, headers)
    }
    const history = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-MAX_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
    if (!history.length || history[history.length - 1].role !== 'user') return json({ error: 'No question' }, 400, headers)
    const context = JSON.stringify(body.context ?? {}).slice(0, 3000)

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.MODEL || 'gpt-5-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'system', content: `CURRENT VIEW (live data from the app, may be empty): ${context}` },
          ...history,
        ],
        max_completion_tokens: 1500,
        reasoning_effort: env.REASONING || 'low',
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.log('OpenAI error', res.status, detail.slice(0, 500))
      return json({ error: 'The assistant is unavailable right now.' }, 502, headers)
    }
    const data = await res.json()
    const reply = data.choices?.[0]?.message?.content?.trim()
    return json({ reply: reply || 'Sorry, I could not answer that.' }, 200, headers)
  },
}
