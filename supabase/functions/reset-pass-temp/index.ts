// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // Usa o GoTrue admin API diretamente via fetch com service role
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/3d500d24-0bbb-4ac1-8595-45692170bc92`, {
    method: 'PATCH',
    headers: {
      'apikey':        serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ password: '123456' }),
  })
  const body = await res.json()

  return new Response(JSON.stringify({ status: res.status, body }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
