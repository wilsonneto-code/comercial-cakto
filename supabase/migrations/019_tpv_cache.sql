-- ============================================================
-- Migration 019: Tabela de cache de TPV por ativação
-- ============================================================

-- Garante que service_role tenha acesso às tabelas usadas pela Edge Function
GRANT ALL ON public.activations TO service_role;
GRANT ALL ON public.users       TO service_role;

CREATE TABLE IF NOT EXISTS public.tpv_cache (
  id                serial       PRIMARY KEY,
  ativacao_id       varchar(255) UNIQUE,
  cliente_email     varchar(255),
  closer_email      varchar(255),
  sdr_email         varchar(255),
  time_id           varchar(50),
  data_fechamento   timestamptz,
  tpv_30_dias       numeric      NOT NULL DEFAULT 0,
  tpv_7_dias        numeric      NOT NULL DEFAULT 0,
  gatilho_roleta    boolean      NOT NULL DEFAULT false,
  bonus_closer      numeric      NOT NULL DEFAULT 0,
  bonus_sdr         numeric      NOT NULL DEFAULT 0,
  ultima_atualizacao timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tpv_cache_closer   ON public.tpv_cache(closer_email);
CREATE INDEX IF NOT EXISTS idx_tpv_cache_sdr      ON public.tpv_cache(sdr_email);
CREATE INDEX IF NOT EXISTS idx_tpv_cache_time     ON public.tpv_cache(time_id);
CREATE INDEX IF NOT EXISTS idx_tpv_cache_ativacao ON public.tpv_cache(ativacao_id);

ALTER TABLE public.tpv_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tpv_cache' AND policyname = 'Allow all for authenticated'
  ) THEN
    CREATE POLICY "Allow all for authenticated" ON public.tpv_cache
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
