import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// Helper function to get the current user's org_id and role from JWT
export const getCurrentUserClaims = () => {
  const session = supabase.auth.getSession()
  return session.then(({ data: { session } }) => {
    if (!session?.user) return null
    
    const claims = session.user.user_metadata || {}
    return {
      userId: session.user.id,
      orgId: claims.org_id,
      role: claims.role,
      profileId: claims.profile_id
    }
  })
}

// Helper to set RLS context
export const setRLSContext = async (orgId: string, profileId: string, role: string) => {
  await supabase.rpc('set_claim', {
    claim: 'org_id',
    value: orgId
  })
  
  await supabase.rpc('set_claim', {
    claim: 'profile_id', 
    value: profileId
  })
  
  await supabase.rpc('set_claim', {
    claim: 'role',
    value: role
  })
}
