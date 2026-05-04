import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Singleton absoluto fora de qualquer função para evitar múltiplas instâncias
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,   // sem OAuth redirect — evita SIGNED_IN duplo
    storageKey: 'comercial-auth-token',
    flowType: 'implicit',        // sem Web Locks — adequado para SPA email/senha
  },
})