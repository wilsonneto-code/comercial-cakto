-- Migration 010: Adiciona hora de término à tabela calls
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS end_time text NOT NULL DEFAULT '';
