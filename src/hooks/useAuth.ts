import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * Session state, or a permanently signed-out stub when sync is not configured.
 *
 * Nothing in the app is gated on this. Signing in only ever adds the ability to
 * carry a history between devices — an attention trainer that greets you with a
 * login wall is one you stop opening.
 */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Returns to wherever the app is actually running, so one build works on
      // localhost and on the deployed origin without a rebuild.
      options: { redirectTo: window.location.origin },
    })
  }, [])

  const signOut = useCallback(async () => {
    // Local history deliberately survives sign-out. It is yours, it lives in
    // this browser, and leaving a sync service should not wipe it.
    if (supabase) await supabase.auth.signOut()
  }, [])

  return {
    session,
    user: session?.user ?? null,
    loading,
    signInWithGoogle,
    signOut,
  }
}
