-- ============================================================
-- Migration 007: Rastreio e transportadora nas submissões
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS tracking_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS carrier       text NOT NULL DEFAULT '';

-- Índice opcional para buscas por código
CREATE INDEX IF NOT EXISTS form_submissions_tracking_code_idx
  ON public.form_submissions (tracking_code)
  WHERE tracking_code <> '';
