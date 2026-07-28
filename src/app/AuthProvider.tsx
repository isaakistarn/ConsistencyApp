import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { watchAuth } from '@/services/supabase/auth'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { getProfile, updateProfile } from '@/services/db/repositories/preferences'
import { deviceTimeZone } from '@/lib/dates'

interface AuthContextValue {
  user: User | null
  /** Auth state not yet resolved (first load) */
  loading: boolean
  /** True when running without Supabase credentials (local-only mode) */
  localOnly: boolean
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  localOnly: !isSupabaseConfigured,
})

/**
 * Keep the server-side profile timezone aligned with the device. Scheduled
 * notifications are computed in this timezone, so it must follow the user.
 * Only updates an EXISTING local profile row (never creates one) to avoid
 * clobbering server fields before the first pull completes.
 */
async function ensureProfileTimezone(): Promise<void> {
  const profile = await getProfile()
  const tz = deviceTimeZone()
  if (profile && profile.timezone !== tz) {
    await updateProfile({ timezone: tz })
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(
    () =>
      watchAuth((next) => {
        setUser(next)
        setLoading(false)
      }),
    []
  )

  useEffect(() => {
    if (!user) return
    // Once now (profile may already be local) and once after the initial
    // sync pull has had time to land.
    void ensureProfileTimezone()
    const timer = window.setTimeout(() => void ensureProfileTimezone(), 8000)
    return () => window.clearTimeout(timer)
  }, [user])

  return (
    <AuthContext.Provider value={{ user, loading, localOnly: !isSupabaseConfigured }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
