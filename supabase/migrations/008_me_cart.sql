-- ============================================================
-- Migration 008: me_cart_id + status "No Carrinho"
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS me_cart_id text NOT NULL DEFAULT '';

-- Atualizar constraint de status para incluir "No Carrinho"
ALTER TABLE public.form_submissions
  DROP CONSTRAINT IF EXISTS form_submissions_status_check;

ALTER TABLE public.form_submissions
  ADD CONSTRAINT form_submissions_status_check
  CHECK (status IN ('Pendente', 'No Carrinho', 'Em Trânsito', 'Entregue', 'Cancelado'));
