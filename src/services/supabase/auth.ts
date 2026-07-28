import { getSupabase, isSupabaseConfigured } from '@/services/supabase/client'
import { syncEngine } from '@/services/sync/engine'
import { setCurrentUserId } from '@/services/db/repository'
import { clearLocalData } from '@/services/db/database'
import { deviceTimeZone } from '@/lib/dates'
import type { User } from '@supabase/supabase-js'

export type AuthListener = (user: User | null) => void

export async function signUp(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signUp({
    email,
    password,
    options: {
      data: { timezone: deviceTimeZone() },
      emailRedirectTo: appRedirectUrl(),
    },
  })
  if (error) throw error
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  await syncEngine.stop()
  await getSupabase().auth.signOut()
  setCurrentUserId('local')
  // Local data belongs to the account — clear it on sign-out so the next
  // user of this device cannot read it. It re-syncs on next sign-in.
  await clearLocalData()
}

export async function deleteAccountData(): Promise<void> {
  // With RLS + cascading deletes, removing the auth user removes everything.
  // Self-serve user deletion requires a service-role context, so we clear all
  // owned rows here and direct the user to account deletion support.
  const supabase = getSupabase()
  const tables = [
    'activity_logs',
    'completion_logs',
    'daily_statistics',
    'reminder_occurrences',
    'reminders',
    'time_blocks',
    'categories',
    'telegram_settings',
  ]
  const { data } = await supabase.auth.getUser()
  const uid = data.user?.id
  if (!uid) return
  for (const t of tables) {
    await supabase.from(t).delete().eq('user_id', uid)
  }
  await clearLocalData()
}

/**
 * Bootstrap auth: resolve the current session, start/stop sync on changes.
 * Returns an unsubscribe function.
 */
export function watchAuth(listener: AuthListener): () => void {
  if (!isSupabaseConfigured) {
    setCurrentUserId('local')
    listener(null)
    return () => {}
  }
  const supabase = getSupabase()

  void supabase.auth.getSession().then(({ data }) => {
    const user = data.session?.user ?? null
    if (user) {
      setCurrentUserId(user.id)
      void syncEngine.start(user.id)
    }
    listener(user)
  })

  const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user ?? null
    if (event === 'SIGNED_IN' && user) {
      setCurrentUserId(user.id)
      void syncEngine.start(user.id)
    }
    if (event === 'SIGNED_OUT') {
      void syncEngine.stop()
      setCurrentUserId('local')
    }
    listener(user)
  })
  return () => sub.subscription.unsubscribe()
}

function appRedirectUrl(): string {
  return window.location.origin + import.meta.env.BASE_URL
}
