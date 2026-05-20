-- ============================================================
-- Migration 013: SDR em ativações + tabela webhook_logs
-- ============================================================

-- Colunas SDR na tabela de ativações
ALTER TABLE public.activations
  ADD COLUMN IF NOT EXISTS sdr_id   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sdr_nome text,
  ADD COLUMN IF NOT EXISTS sem_sdr  boolean NOT NULL DEFAULT false;

-- Tabela de logs dos webhooks DataCrazy
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ativacao_id uuid        REFERENCES public.activations(id) ON DELETE SET NULL,
  payload     jsonb       NOT NULL DEFAULT '{}',
  status      text        NOT NULL DEFAULT 'pendente',
  tentativas  integer     NOT NULL DEFAULT 0,
  erro        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'webhook_logs' AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON public.webhook_logs
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
