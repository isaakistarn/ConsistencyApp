import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { watchAuth } from '@/services/supabase/auth'
import { isSupabaseConfigured } from '@/services/supabase/client'

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
