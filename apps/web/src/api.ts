const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export type Tokens = { accessToken: string; refreshToken: string }

const KEY = 'camarin.tokens'

export function getTokens(): Tokens | null {
  const raw = localStorage.getItem(KEY)
  return raw ? (JSON.parse(raw) as Tokens) : null
}

export function setTokens(tokens: Tokens | null) {
  if (tokens) localStorage.setItem(KEY, JSON.stringify(tokens))
  else localStorage.removeItem(KEY)
}

async function doRefresh(): Promise<Tokens> {
  const tokens = getTokens()
  if (!tokens) throw new Error('no session')
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  })
  if (!res.ok) {
    setTokens(null)
    window.dispatchEvent(new Event('auth:logout'))
    throw new Error('session expired')
  }
  const next = (await res.json()) as Tokens
  setTokens(next)
  return next
}

// one refresh shared across concurrent 401s, so a burst of requests doesn't
// trigger a dozen rotations (which reuse-detection would then flag as theft)
let refreshing: Promise<Tokens> | null = null
function refreshOnce(): Promise<Tokens> {
  if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = null))
  return refreshing
}

export async function api(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers)
  const tokens = getTokens()
  if (tokens) headers.set('authorization', `Bearer ${tokens.accessToken}`)
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json')

  let res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401 && tokens) {
    const next = await refreshOnce()
    headers.set('authorization', `Bearer ${next.accessToken}`)
    res = await fetch(`${BASE}${path}`, { ...options, headers })
  }
  return res
}

export { BASE }
