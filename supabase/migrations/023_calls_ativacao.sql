-- Migration: 023_calls_ativacao.sql
-- Adiciona campos de ativação às calls

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS ativado               boolean,
  ADD COLUMN IF NOT EXISTS motivo_nao_ativacao   text;
