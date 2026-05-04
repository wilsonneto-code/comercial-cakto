import { supabase } from './client';

/** Grava uma linha na tabela audit_logs (fire-and-forget — erros são ignorados silenciosamente). */
export async function logAudit(
  userId: string | null,
  userName: string,
  action: string,
  module: string,
) {
  await supabase.from('audit_logs').insert({ user_id: userId, user_name: userName, action, module });
}
