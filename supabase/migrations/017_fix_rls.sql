-- Migration: 017_fix_rls.sql
-- Corrige policies RLS usando auth.uid() em vez de auth.jwt() ->> 'email'
-- e remove registro de token desnecessário

-- ── configuracoes ────────────────────────────────────────────────────────────
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin gerencia configuracoes"    ON public.configuracoes;
DROP POLICY IF EXISTS "Admin pode tudo em configuracoes" ON public.configuracoes;

CREATE POLICY "Admin pode tudo em configuracoes"
  ON public.configuracoes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id   = auth.uid()
        AND users.role = 'Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id   = auth.uid()
        AND users.role = 'Admin'
    )
  );

-- ── webhook_logs ─────────────────────────────────────────────────────────────
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin pode ver webhook_logs"     ON public.webhook_logs;
DROP POLICY IF EXISTS "Admin pode tudo em webhook_logs" ON public.webhook_logs;

CREATE POLICY "Admin pode tudo em webhook_logs"
  ON public.webhook_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id   = auth.uid()
        AND users.role = 'Admin'
    )
  );

-- ── remove token (não é necessário para o DataCrazy) ─────────────────────────
DELETE FROM public.configuracoes WHERE chave = 'datacrazy_webhook_token';
