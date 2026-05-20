-- ============================================================
-- Migration 021: Tabela tpv_clientes
-- Armazena o estado de cada cliente ativado (30 dias)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tpv_clientes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ativacao_id          UUID UNIQUE NOT NULL,
  cliente_email        TEXT NOT NULL,
  closer_email         TEXT,
  sdr_email            TEXT,
  time_id              TEXT,           -- 'Time 01', 'Time 02', 'Time 03'
  canal                TEXT,
  data_ativacao        DATE NOT NULL,
  data_fim             DATE NOT NULL,
  tpv_atual            NUMERIC DEFAULT 0,
  status               TEXT DEFAULT 'ativo',  -- 'ativo' | 'expirado'
  removido_manualmente BOOLEAN DEFAULT FALSE,
  observacao           TEXT,
  ultima_atualizacao   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tpv_clientes_time_id    ON public.tpv_clientes (time_id);
CREATE INDEX IF NOT EXISTS idx_tpv_clientes_status     ON public.tpv_clientes (status);
CREATE INDEX IF NOT EXISTS idx_tpv_clientes_data_fim   ON public.tpv_clientes (data_fim);
CREATE INDEX IF NOT EXISTS idx_tpv_clientes_ativacao   ON public.tpv_clientes (ativacao_id);

ALTER TABLE public.tpv_clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tpv_clientes"
  ON public.tpv_clientes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can upsert tpv_clientes"
  ON public.tpv_clientes FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update tpv_clientes"
  ON public.tpv_clientes FOR UPDATE
  TO authenticated USING (true);

GRANT ALL ON public.tpv_clientes TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.tpv_clientes TO authenticated;
