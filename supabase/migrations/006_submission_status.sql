-- ============================================================
-- Migration 006: Status de entrega nas submissões de formulário
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Pendente'
  CHECK (status IN ('Pendente', 'Em Trânsito', 'Entregue', 'Cancelado'));

-- Todas as submissões existentes ficam com status 'Pendente' (DEFAULT acima cobre isso)
