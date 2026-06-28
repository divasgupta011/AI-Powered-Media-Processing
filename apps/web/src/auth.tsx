import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { BASE, api, getTokens, setTokens } from './api'

type User = { id: string; email: string }

type AuthValue = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue>(null!)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // on boot, if there's a stored session, confirm it's still valid
  useEffect(() => {
    if (!getTokens()) {
      setLoading(false)
      return
    }
    api('/auth/me')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('unauthorized'))))
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  // the api client fires this when a refresh fails
  useEffect(() => {
    const onLogout = () => setUser(null)
    window.addEventListener('auth:logout', onLogout)
    return () => window.removeEventListener('auth:logout', onLogout)
  }, [])

  async function authenticate(path: string, email: string, password: string) {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? 'something went wrong')
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken })
    setUser(data.user)
  }

  const value: AuthValue = {
    user,
    loading,
    login: (email, password) => authenticate('/auth/login', email, password),
    signup: (email, password) => authenticate('/auth/signup', email, password),
    logout: async () => {
      const tokens = getTokens()
      if (tokens) {
        await api('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        }).catch(() => {})
      }
      setTokens(null)
      setUser(null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
