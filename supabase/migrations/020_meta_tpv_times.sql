-- ============================================================
-- Migration 020: Metas de TPV por time
-- ============================================================
INSERT INTO public.configuracoes (chave, valor) VALUES
  ('meta_tpv_time_01', '1000000'),
  ('meta_tpv_time_02', '1000000'),
  ('meta_tpv_time_03', '1000000')
ON CONFLICT (chave) DO NOTHING;
