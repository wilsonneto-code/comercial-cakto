-- Migration 009: Adiciona colunas Google Calendar à tabela calls
-- Execute no Supabase SQL Editor ou via CLI

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS google_event_id  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS meet_link        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS client_email     text NOT NULL DEFAULT '';
