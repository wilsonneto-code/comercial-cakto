import { supabase } from './supabase/client'

export async function logActivity(
  userId: string,
  userName: string,
  action: string,
  entity: string,
  entityLabel: string,
  description: string,
  metadata?: Record<string, unknown>,
) {
  await supabase.from('activity_logs').insert({
    user_id: userId,
    user_name: userName,
    action,
    entity,
    entity_label: entityLabel,
    description,
    metadata: metadata ?? null,
  })
}
