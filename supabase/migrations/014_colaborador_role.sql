-- ============================================================
-- Migration 014: Cargo 'Colaborador' + campo setor em users
-- ============================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Colaborador';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS setor text;
