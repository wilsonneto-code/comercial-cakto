-- Migration 033: flag para identificar ativações feitas pelo GC
ALTER TABLE public.activations
  ADD COLUMN IF NOT EXISTS gc_ativacao boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_activations_gc ON public.activations(gc_ativacao);
