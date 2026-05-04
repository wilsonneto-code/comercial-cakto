-- Migration: 018_fix_rls_v2.sql
-- RLS baseada em email (via auth.jwt()) — mais confiável quando users.id
-- não coincide com auth.uid()

-- ── configuracoes ────────────────────────────────────────────────────────────
ALTER TABLE public.configuracoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin pode tudo em configuracoes"  ON public.configuracoes;
DROP POLICY IF EXISTS "Admin acessa configuracoes"        ON public.configuracoes;
DROP POLICY IF EXISTS "Admin gerencia configuracoes"      ON public.configuracoes;

CREATE POLICY "Admin acessa configuracoes"
  ON public.configuracoes
  FOR ALL
  TO authenticated
  USING (
    (SELECT role FROM public.users WHERE email = auth.jwt() ->> 'email') = 'Admin'
  );

-- ── webhook_logs ─────────────────────────────────────────────────────────────
ALTER TABLE public.webhook_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin pode ver webhook_logs"       ON public.webhook_logs;
DROP POLICY IF EXISTS "Admin pode tudo em webhook_logs"   ON public.webhook_logs;
DROP POLICY IF EXISTS "Admin acessa webhook_logs"         ON public.webhook_logs;

CREATE POLICY "Admin acessa webhook_logs"
  ON public.webhook_logs
  FOR ALL
  TO authenticated
  USING (
    (SELECT role FROM public.users WHERE email = auth.jwt() ->> 'email') = 'Admin'
  );
